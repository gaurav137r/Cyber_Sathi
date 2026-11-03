export interface TextToSpeechResult {
  audio: Buffer
  contentType: string
  extension: string
}

export interface TextToSpeechService {
  synthesize(text: string, language: string): Promise<TextToSpeechResult>
}

export const TEXT_TO_SPEECH_SERVICE = Symbol("TEXT_TO_SPEECH_SERVICE")
