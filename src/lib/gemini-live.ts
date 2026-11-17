import { requestMicrophoneAccess } from "./microphone"
import type { SathiResponse } from "./sathi"

type LiveSession = NonNullable<SathiResponse["live"]>

type LiveCallbacks = {
  onReady: () => void
  onStatus: (status: string) => void
  onInputTranscript: (text: string, final: boolean) => void
  onOutputTranscript: (text: string) => void
  onTurnComplete: () => void
  onError: (error: Error) => void
  onClose: () => void
}

type LiveAudioPart = {
  inlineData?: {
    data?: string
    mimeType?: string
  }
}

type LiveServerMessage = {
  setupComplete?: unknown
  error?: { message?: string }
  serverContent?: {
    interimInputTranscription?: { text?: string }
    inputTranscription?: { text?: string }
    outputTranscription?: { text?: string }
    interrupted?: boolean
    turnComplete?: boolean
    modelTurn?: { parts?: LiveAudioPart[] }
  }
}

const INPUT_SAMPLE_RATE = 16000
const OUTPUT_SAMPLE_RATE = 24000

export class GeminiLiveVoice {
  private socket: WebSocket | null = null
  private stream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private processor: ScriptProcessorNode | null = null
  private silentGain: GainNode | null = null
  private readonly playingSources = new Set<AudioBufferSourceNode>()
  private nextPlaybackTime = 0
  private stopped = false
  private ready = false

  constructor(private readonly callbacks: LiveCallbacks) {}

  async start(
    session: LiveSession,
    microphoneStream?: MediaStream,
  ): Promise<void> {
    this.stream = microphoneStream ?? null
    this.audioContext = new AudioContext()
    await this.audioContext.resume()
    const url = new URL(session.websocketUrl)
    url.searchParams.set(session.authQueryParam, session.ephemeralToken)
    this.socket = new WebSocket(url)

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const timeout = window.setTimeout(() => {
        fail(new Error("Google Live did not finish connecting in time."))
      }, 15000)

      const fail = (error: Error) => {
        if (settled) return
        settled = true
        window.clearTimeout(timeout)
        reject(error)
      }

      this.socket!.onopen = () => {
        this.socket!.send(
          JSON.stringify({
            setup: {
              model: `models/${session.model}`,
              ...session.setupConfig,
            },
          }),
        )
      }

      this.socket!.onmessage = (event) => {
        let response: LiveServerMessage
        try {
          response = (JSON.parse(String(event.data)) as LiveServerMessage)
        } catch {
          fail(new Error("Google Live sent an invalid response."))
          return
        }

        if (response.error?.message) {
          fail(new Error(response.error.message))
          return
        }

        if (response.setupComplete && !this.ready) {
          this.ready = true
          void this.startAudio().then(
            () => {
              if (settled) return
              settled = true
              window.clearTimeout(timeout)
              this.callbacks.onReady()
              resolve()
            },
            (error: unknown) => {
              fail(
                error instanceof Error
                  ? error
                  : new Error("Could not start microphone audio."),
              )
            },
          )
        }

        this.handleServerContent(response.serverContent)
      }

      this.socket!.onerror = () => {
        const error = new Error(
          "Google Live could not connect. Check the API connection and try again.",
        )
        this.callbacks.onError(error)
        fail(error)
      }

      this.socket!.onclose = (event) => {
        if (!settled)
          fail(
            new Error(
              event.reason || "Google Live closed before the session started.",
            ),
          )
        if (!this.stopped) this.callbacks.onClose()
      }
    })
  }

  sendText(text: string): void {
    if (this.socket?.readyState !== WebSocket.OPEN)
      throw new Error("Google Live is not connected.")

    this.socket.send(JSON.stringify({ realtimeInput: { text } }))
  }

  stop(): void {
    if (this.stopped) return
    this.stopped = true
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(
        JSON.stringify({ realtimeInput: { audioStreamEnd: true } }),
      )
    if (this.processor) this.processor.onaudioprocess = null
    this.source?.disconnect()
    this.processor?.disconnect()
    this.silentGain?.disconnect()
    this.stream?.getTracks().forEach((track) => track.stop())
    for (const source of this.playingSources) source.stop()
    this.playingSources.clear()
    if (this.audioContext && this.audioContext.state !== "closed")
      void this.audioContext.close()
    if (this.socket && this.socket.readyState !== WebSocket.CLOSED)
      this.socket.close()
  }

  private async startAudio(): Promise<void> {
    this.stream ??= await requestMicrophoneAccess()
    const audioContext = this.audioContext
    if (!audioContext) throw new Error("The audio context is unavailable.")
    await audioContext.resume()
    this.source = audioContext.createMediaStreamSource(this.stream)
    this.processor = audioContext.createScriptProcessor(4096, 1, 1)
    this.silentGain = audioContext.createGain()
    this.silentGain.gain.value = 0
    this.processor.onaudioprocess = (event) => {
      const socket = this.socket
      if (!socket || socket.readyState !== WebSocket.OPEN) return
      const pcm = downsampleToPcm16(
        event.inputBuffer.getChannelData(0),
        audioContext.sampleRate,
        INPUT_SAMPLE_RATE,
      )
      if (pcm.length === 0) return
      socket.send(
        JSON.stringify({
          realtimeInput: {
            audio: {
              data: encodeBase64(pcm),
              mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`,
            },
          },
        }),
      )
    }
    this.source.connect(this.processor)
    this.processor.connect(this.silentGain)
    this.silentGain.connect(audioContext.destination)
    this.callbacks.onStatus("Connected to Google Gemini Live. Listening...")
  }

  private handleServerContent(
    content: LiveServerMessage["serverContent"],
  ): void {
    if (!content) return
    if (content.interrupted) this.stopPlayback()
    const interim = content.interimInputTranscription?.text
    if (interim) this.callbacks.onInputTranscript(interim, false)
    const transcript = content.inputTranscription?.text
    if (transcript) this.callbacks.onInputTranscript(transcript, true)
    const output = content.outputTranscription?.text
    if (output) this.callbacks.onOutputTranscript(output)
    for (const part of content.modelTurn?.parts ?? []) {
      const audio = part.inlineData
      if (audio?.data) void this.playAudio(audio.data, audio.mimeType)
    }
    if (content.turnComplete) this.callbacks.onTurnComplete()
  }

  private async playAudio(data: string, mimeType?: string): Promise<void> {
    if (!this.audioContext) return
    const bytes = decodeBase64(data)
    const sampleCount = Math.floor(bytes.byteLength / 2)
    if (sampleCount === 0) return
    const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, sampleCount)
    const sampleRate =
      Number(mimeType?.match(/rate=(\d+)/)?.[1]) || OUTPUT_SAMPLE_RATE
    const audio = this.audioContext.createBuffer(1, sampleCount, sampleRate)
    const samples = audio.getChannelData(0)
    for (let i = 0; i < sampleCount; i++) samples[i] = pcm[i] / 32768

    const source = this.audioContext.createBufferSource()
    source.buffer = audio
    source.connect(this.audioContext.destination)
    source.onended = () => {
      this.playingSources.delete(source)
      source.disconnect()
    }
    const when = Math.max(this.audioContext.currentTime, this.nextPlaybackTime)
    source.start(when)
    this.nextPlaybackTime = when + audio.duration
    this.playingSources.add(source)
  }

  private stopPlayback(): void {
    for (const source of this.playingSources) source.stop()
    this.playingSources.clear()
    this.nextPlaybackTime = this.audioContext?.currentTime ?? 0
  }
}

function downsampleToPcm16(
  input: Float32Array,
  inputRate: number,
  outputRate: number,
): Int16Array {
  const ratio = inputRate / outputRate
  const length = Math.floor(input.length / ratio)
  const output = new Int16Array(length)
  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * ratio)
    const end = Math.min(Math.floor((i + 1) * ratio), input.length)
    let total = 0
    for (let j = start; j < end; j++) total += input[j]
    const sample = Math.max(-1, Math.min(1, total / Math.max(end - start, 1)))
    output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
  }
  return output
}

function encodeBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  return btoa(String.fromCharCode(...bytes))
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
