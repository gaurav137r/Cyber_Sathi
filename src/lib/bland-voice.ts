import { useCallback, useEffect, useRef, useState } from "react"
import { useWebchat } from "@blandsdk/client/react"

import { supabase } from "./supabase"
import {
  getMicrophoneErrorMessage,
  requestMicrophoneAccess,
} from "./microphone"

const apiBaseUrl =
  import.meta.env.VITE_API_URL ||
  `${window.location.protocol}//${window.location.hostname}:3000`

export const BLAND_AGENT_ID =
  import.meta.env.VITE_BLAND_AGENT_ID || "209a8a84-d772-401f-9b33-6930cf55c939"

/**
 * The SDK ships with a hard-coded 10s silence watchdog (`wsSettings.timeout`).
 * A caller who is thinking, reading a SMS, or finding a UPI reference can be
 * quiet for longer than that, which used to tear down a perfectly healthy call.
 * We widen the timeout and keep the activity clock warm while the socket is up.
 */
const SDK_SILENCE_INTERVAL_MS = 10_000
const SDK_SILENCE_TIMEOUT_MS = 120_000
const HEARTBEAT_MS = 5_000
const CONNECT_TIMEOUT_MS = 20_000
const MAX_RECONNECT_ATTEMPTS = 2

type VoicePhase = "closed" | "connecting" | "open"

interface WebchatInternals {
  wsSettings?: { interval: number; timeout: number }
  setActivity?: () => void
}

export interface BlandVoiceResult {
  state: VoicePhase
  start: () => Promise<void>
  stop: () => void
  isStarted: boolean
  isStarting: boolean
  micReady: boolean
  error: string
  messages: Array<{ role: string; text: string }>
  isAgentSpeaking: boolean
  voiceMode: "primary" | "fallback"
}

export function useBlandVoiceAgent(
  caseId: string | null,
  agentId: string | undefined,
  language: string,
  onTranscript?: (role: "user" | "agent", text: string, turnId?: string) => void,
  onStateChange?: (state: string) => void,
): BlandVoiceResult {
  const [phase, setPhase] = useState<VoicePhase>("closed")
  const [error, setError] = useState("")
  const [micReady, setMicReady] = useState(false)
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false)
  const [voiceMode, setVoiceMode] = useState<"primary" | "fallback">("primary")

  const enabled = Boolean(caseId && agentId)

  const startInProgress = useRef(false)
  const userStopped = useRef(false)
  const wasOpen = useRef(false)
  const reconnectAttempts = useRef(0)
  const reconnectTimer = useRef<number | null>(null)
  const connectTimer = useRef<number | null>(null)
  const speakingTimer = useRef<number | null>(null)
  const messagesRef = useRef<Array<{ role: string; text: string }>>([])
  const phaseRef = useRef<VoicePhase>("closed")
  const transcriptRef = useRef(onTranscript)
  const stateChangeRef = useRef(onStateChange)
  const connectRef = useRef<(retry?: boolean) => Promise<void>>(
    async () => undefined,
  )

  transcriptRef.current = onTranscript
  stateChangeRef.current = onStateChange

  const { start, stop, webchat } = useWebchat({
    agentId: agentId || "",
    getToken: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      }
      if (session?.access_token)
        headers["Authorization"] = `Bearer ${session.access_token}`

      const response = await fetch(
        `${apiBaseUrl.replace(/\/+$/, "")}/cases/${encodeURIComponent(
          caseId!,
        )}/voice/session`,
        { method: "POST", headers, body: JSON.stringify({ language }) },
      )
      if (!response.ok) {
        const body = await response.text().catch(() => "")
        throw new Error(
          response.status === 429
            ? "Too many voice connection attempts. Please wait a minute and try again."
            : `Could not create the voice session (${response.status}${
                body ? ": " + body.slice(0, 200) : ""
              })`,
        )
      }
      const data = await response.json()
      if (data.mode) {
        setVoiceMode(data.mode)
      }
      if (!data.sessionToken) {
        throw new Error("Voice authorization returned no session token.")
      }
      return { token: data.sessionToken }
    },
  })

  const startRef = useRef(start)
  const stopRef = useRef(stop)
  startRef.current = start
  stopRef.current = stop

  const clearSpeakingTimer = useCallback(() => {
    if (speakingTimer.current) {
      window.clearTimeout(speakingTimer.current)
      speakingTimer.current = null
    }
  }, [])

  const clearConnectTimer = useCallback(() => {
    if (connectTimer.current) {
      window.clearTimeout(connectTimer.current)
      connectTimer.current = null
    }
  }, [])

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimer.current) {
      window.clearTimeout(reconnectTimer.current)
      reconnectTimer.current = null
    }
  }, [])

  const updatePhase = useCallback((next: VoicePhase) => {
    phaseRef.current = next
    setPhase(next)
    stateChangeRef.current?.(next)
  }, [])

  // The SDK should never drop an otherwise healthy call just because the
  // caller was quiet for more than its default 10 seconds.
  useEffect(() => {
    if (!webchat) return
    const internals = webchat as unknown as WebchatInternals
    internals.wsSettings = {
      interval: SDK_SILENCE_INTERVAL_MS,
      timeout: SDK_SILENCE_TIMEOUT_MS,
    }
    const heartbeat = window.setInterval(() => {
      if (phaseRef.current === "open") internals.setActivity?.()
    }, HEARTBEAT_MS)
    return () => window.clearInterval(heartbeat)
  }, [webchat])

  const scheduleReconnect = useCallback(() => {
    if (!enabled || userStopped.current || wasOpen.current === false && phaseRef.current !== "open") {
      // no auto-reconnect unless we had an established session drop
    }
    if (!enabled || userStopped.current) return
    if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
      setError(
        "The voice connection dropped and could not be restored. Please tap Try voice again.",
      )
      updatePhase("closed")
      return
    }
    reconnectAttempts.current += 1
    setError("The voice connection dropped. Reconnecting…")
    updatePhase("connecting")
    reconnectTimer.current = window.setTimeout(() => {
      reconnectTimer.current = null
      if (userStopped.current || !enabled) return
      void connectRef.current(true)
    }, 1_200 * reconnectAttempts.current)
  }, [enabled, updatePhase])

  // Event subscriptions. These use refs so re-renders never tear down a call.
  useEffect(() => {
    if (!webchat || !enabled) return

    const bumpSpeaking = (active: boolean) => {
      clearSpeakingTimer()
      if (active) {
        setIsAgentSpeaking(true)
        speakingTimer.current = window.setTimeout(() => {
          setIsAgentSpeaking(false)
          speakingTimer.current = null
        }, 2_000)
      } else {
        setIsAgentSpeaking(false)
      }
    }

    const handleUpdate = (data: unknown) => {
      let packet = data
      if (typeof packet === "string") {
        try {
          packet = JSON.parse(packet)
        } catch {
          return
        }
      }
      const record = packet as Record<string, any> | null | undefined
      const payload = record?.payload ?? record
      if (!payload || typeof payload !== "object") return
      const text = payload.text ?? payload.content ?? ""
      const type = payload.type ?? payload.role
      const role = type === "assistant" || type === "agent" ? "agent" : "user"
      const turnId = payload.packetId ?? payload.turn_id ?? payload.id
      const speakingSignal =
        role === "agent" ||
        payload.speaking === true ||
        payload.is_speaking === true ||
        payload.audio === true
      if (speakingSignal) bumpSpeaking(true)
      if (payload.complete === false) return
      const clean = typeof text === "string" ? text.trim() : ""
      if (!clean) return
      const previous = messagesRef.current[messagesRef.current.length - 1]
      if (previous?.role === role && previous.text === clean) return
      messagesRef.current.push({ role, text: clean })
      transcriptRef.current?.(
        role,
        clean,
        typeof turnId === "string" ? turnId : undefined,
      )
    }

    const handleOpen = () => {
      clearConnectTimer()
      clearReconnectTimer()
      reconnectAttempts.current = 0
      userStopped.current = false
      wasOpen.current = true
      startInProgress.current = false
      setError("")
      bumpSpeaking(false)
      updatePhase("open")
    }

    const handleClosed = () => {
      clearConnectTimer()
      clearReconnectTimer()
      clearSpeakingTimer()
      setIsAgentSpeaking(false)
      startInProgress.current = false
      const hadOpenSession = wasOpen.current
      wasOpen.current = false
      updatePhase("closed")
      if (userStopped.current || !enabled) return
      // Only auto-reconnect after an established session drops unexpectedly.
      // Do not reconnect after explicit stop or failed initial connect.
      if (hadOpenSession) {
        scheduleReconnect()
      } else {
        setError((current) => current || "Voice session disconnected.")
      }
    }

    const handleError = (err: unknown) => {
      clearConnectTimer()
      clearSpeakingTimer()
      setIsAgentSpeaking(false)
      startInProgress.current = false
      updatePhase("closed")
      if (userStopped.current) return
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "The voice connection reported an error."
      setError(message)
    }

    const unsubUpdate = webchat.on("update", handleUpdate)
    const unsubOpen = webchat.on("open", handleOpen)
    const unsubClosed = webchat.on("closed", handleClosed)
    const unsubError = webchat.on("error", handleError)

    return () => {
      unsubUpdate()
      unsubOpen()
      unsubClosed()
      unsubError()
      clearSpeakingTimer()
    }
  }, [
    webchat,
    enabled,
    clearSpeakingTimer,
    clearConnectTimer,
    clearReconnectTimer,
    scheduleReconnect,
    updatePhase,
  ])

  // Stop any stale "connecting" state if the SDK never ends up opening.
  useEffect(() => {
    if (phase !== "connecting") return
    clearConnectTimer()
    connectTimer.current = window.setTimeout(() => {
      connectTimer.current = null
      if (phaseRef.current !== "connecting") return
      startInProgress.current = false
      userStopped.current = true
      try {
        stopRef.current()
      } catch {
        // Ignore teardown races.
      }
      updatePhase("closed")
      setError(
        "Voice took too long to connect. Check your network and try again.",
      )
    }, CONNECT_TIMEOUT_MS)
    return clearConnectTimer
  }, [phase, clearConnectTimer, updatePhase])

  const connect = useCallback(
    async (retry = false) => {
      if (!enabled) {
        setError(
          caseId
            ? "Voice is not configured for this application."
            : "Your Sathi case is still being prepared. Please wait a moment.",
        )
        return
      }
      if (startInProgress.current || phaseRef.current === "open") return
      if (!retry) {
        reconnectAttempts.current = 0
        clearReconnectTimer()
      }
      startInProgress.current = true
      userStopped.current = false
      wasOpen.current = false
      setError("")
      updatePhase("connecting")

      try {
        if (!micReady) {
          const stream = await requestMicrophoneAccess()
          stream.getTracks().forEach((track) => track.stop())
          setMicReady(true)
        }

        try {
          await startRef.current()
        } catch (cause) {
          // A fast retry can race the previous socket's close. Recover once.
          if (
            cause instanceof Error &&
            /already started/i.test(cause.message)
          ) {
            stopRef.current()
            await new Promise((resolve) => window.setTimeout(resolve, 400))
            await startRef.current()
          } else {
            throw cause
          }
        }
      } catch (cause) {
        clearConnectTimer()
        startInProgress.current = false
        if (userStopped.current) return
        updatePhase("closed")
        const message =
          cause instanceof DOMException
            ? getMicrophoneErrorMessage(cause)
            : cause instanceof Error
              ? cause.message
              : "Could not start the voice session."
        if (!retry && micReady && reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts.current += 1
          setError(`${message} Retrying…`)
          reconnectTimer.current = window.setTimeout(() => {
            reconnectTimer.current = null
            void connectRef.current(true)
          }, 1_000)
        } else {
          setError(message)
        }
      }
    },
    [
      enabled,
      caseId,
      micReady,
      clearConnectTimer,
      clearReconnectTimer,
      updatePhase,
    ],
  )

  connectRef.current = connect

  const handleStart = useCallback(async () => {
    await connect(false)
  }, [connect])

  const handleStop = useCallback(() => {
    userStopped.current = true
    wasOpen.current = false
    startInProgress.current = false
    reconnectAttempts.current = 0
    clearReconnectTimer()
    clearConnectTimer()
    clearSpeakingTimer()
    setIsAgentSpeaking(false)
    setError("")
    updatePhase("closed")
    try {
      // best-effort: stop underlying webchat/session so remote agent call ends
      stopRef.current()
    } catch {
      // Ignore teardown races.
    }
  }, [
    clearReconnectTimer,
    clearConnectTimer,
    clearSpeakingTimer,
    updatePhase,
  ])

  // If this hook unmounts while a call is running, end it cleanly.
  useEffect(
    () => () => {
      userStopped.current = true
      wasOpen.current = false
      startInProgress.current = false
      clearReconnectTimer()
      clearConnectTimer()
      clearSpeakingTimer()
      try {
        stopRef.current()
      } catch {
        // Ignore teardown races.
      }
    },
    [clearReconnectTimer, clearConnectTimer, clearSpeakingTimer],
  )

  // Stop if the hook becomes disabled (e.g. case/session no longer active).
  useEffect(() => {
    if (enabled) return
    userStopped.current = true
    wasOpen.current = false
    startInProgress.current = false
    clearReconnectTimer()
    clearConnectTimer()
    clearSpeakingTimer()
    try {
      stopRef.current()
    } catch {
      // Ignore teardown races.
    }
    setIsAgentSpeaking(false)
    setMicReady(false)
    setError("")
    setPhase("closed")
    phaseRef.current = "closed"
  }, [enabled, clearReconnectTimer, clearConnectTimer, clearSpeakingTimer])

  return {
    state: enabled ? phase : "closed",
    start: handleStart,
    stop: handleStop,
    isStarted: enabled && phase === "open",
    isStarting: enabled && phase === "connecting",
    micReady: enabled ? micReady : false,
    error: enabled ? error : "",
    messages: enabled ? messagesRef.current : [],
    isAgentSpeaking: enabled ? isAgentSpeaking : false,
    voiceMode,
  }
}
