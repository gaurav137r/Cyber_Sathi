import { useEffect, useRef, useState, useCallback } from "react"

import { useConversation } from "../context/ConversationContext"
import { BLAND_AGENT_ID } from "../lib/bland-voice"
import { apiRequest } from "../lib/api"
import Bland from "@blandsdk/client"

type VoiceMode = "primary" | "fallback" | "text-only"

interface VoiceSessionState {
  isActive: boolean
  isConnecting: boolean
  error: string | null
  session: any | null
  mode: VoiceMode
}

export function useVoiceSession() {
  const {
    caseId,
    setVoiceError,
    setVoiceSession,
    setLiveSession,
    setTyping,
    addMessage,
    appendMessage,
    setScreen,
    setToast,
  } = useConversation();

  const [voice, setVoice] = useState<VoiceSessionState>({
    isActive: false,
    isConnecting: false,
    error: null,
    session: null,
    mode: "primary",
  });

  const webchatRef = useRef<any>(null);
  const unsubListenersRef = useRef<Array<() => void>>([]);
  let activeSessionRef = useRef<any>(null);

  const clearListeners = useCallback(() => {
    unsubListenersRef.current.forEach((unsub) => unsub());
    unsubListenersRef.current = [];
  }, []);

  // Remove ALL existing listeners and stop any active session BEFORE starting a new one
  const cleanupExistingSession = useCallback(() => {
    try {
      if (activeSessionRef.current) {
        activeSessionRef.current.stop();
        activeSessionRef.current = null;
      }
      // Remove ALL existing listeners
      if (unsubListenersRef.current) {
        clearListeners();
      }
      if (webchatRef.current) {
        try {
          webchatRef.current.stop();
        } catch (e) {
          // Ignore errors during cleanup
        }
        webchatRef.current = null;
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanupExistingSession();
    };
  }, []);

  const startVoice = useCallback(async () => {
    if (!caseId) {
      setVoiceError("No case selected. Start a case first.");
      return;
    }
    setVoiceError(null);
    setVoice(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      // 1. Cleanup any existing session first
      cleanupExistingSession();

      // 2. Get a voice session from the backend (tries Bland first, falls back)
      const { mode, sessionToken, authorization } = await apiRequest<{
        mode: VoiceMode
        sessionToken: string
        authorization?: string
      }>(
        `/cases/${encodeURIComponent(caseId)}/voice/session`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );

      // Store the voice mode
      setVoice(prev => ({ ...prev, mode: mode || "primary" }));

      // 2. Initialize the Bland webchat client (only once per session)
      if (!webchatRef.current) {
        webchatRef.current = new Bland({
          admin: { apiKey: "dummy" },
          webchat: {
            endpoint: "wss://stream-v2.aws.dc8.bland.ai/ws/connect/blandshared",
          },
        });
      }
      const webchat = await webchatRef.current.WebchatClient();

      // 3. Attach event listeners (store for cleanup)
      const unsubText = webchat.on("text", (text: string) => {
        appendMessage("agent", text);
        setTyping(false);
      });
      unsubListenersRef.current.push(unsubText);

      const unsubOpen = webchat.on("open", async () => {
        setVoiceSession({ sessionToken, authorization });
        setLiveSession(null);
        setVoice(prev => ({ ...prev, isActive: true, isConnecting: false, error: null }));
      });
      unsubListenersRef.current.push(unsubOpen);

      const unsubClosed = webchat.on("closed", () => {
        setVoice(prev => ({ ...prev, isActive: false, session: null }));
      });
      unsubListenersRef.current.push(unsubClosed);

      const unsubError = webchat.on("error", (err: unknown) => {
        setVoiceError(err instanceof Error ? err.message : "Voice session error");
        setVoice(prev => ({ ...prev, isConnecting: false, error: err instanceof Error ? err.message : "Failed" }));
      });
      unsubListenersRef.current.push(unsubError);

      // 4. Start the voice session with the agent
      await webchat.start({
        agentId: BLAND_AGENT_ID,
        sessionId: sessionToken,
        sampleRate: 16000,
      });

      // Mark this session as active
      activeSessionRef.current = webchat;
      setVoice(prev => ({ ...prev, isConnecting: false, isActive: true }));
    } catch (error) {
      setVoice(prev => ({
        ...prev,
        isConnecting: false,
        error: error instanceof Error ? error.message : "Failed to start voice session",
      }));
    }
  }, [caseId]);

  const endVoice = useCallback(() => {
    const webchat = webchatRef.current;
    if (webchat) {
      webchat.stop();
      webchatRef.current = null;
    }
    clearListeners();
    setVoiceSession(null);
    setLiveSession(null);
    setVoiceError(null);
    setVoice(prev => ({ ...prev, isActive: false, session: null }));
  }, []);

  const switchToChat = useCallback(() => {
    endVoice();
    setScreen("chat");
    setToast("Voice ended. You can continue in chat.");
  }, [endVoice, setScreen, setToast]);

  return {
    voice,
    startVoice,
    endVoice,
    switchToChat,
    isStarting: voice.isConnecting,
    isStarted: voice.isActive,
    micReady: true,
    error: voice.error,
    mode: voice.mode,
  };
}
