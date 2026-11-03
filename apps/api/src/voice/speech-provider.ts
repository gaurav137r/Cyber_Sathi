export interface SpeechResult {
  detectedLanguage: string
  transcript: string
  canonicalTranscript: string
}

export interface SpeechService {
  transcribe(audio: Buffer, languageHint?: string): Promise<SpeechResult>
}

export const SPEECH_SERVICE = Symbol("SPEECH_SERVICE")
