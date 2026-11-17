import { Inject, Injectable, NotFoundException } from "@nestjs/common"
import { randomUUID } from "node:crypto"
import { AuthUser } from "../auth/auth.service"
import { PrismaService } from "../infra/prisma.service"
import { TEXT_TO_SPEECH_SERVICE, TextToSpeechService } from "./tts-provider"

@Injectable()
export class TtsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TEXT_TO_SPEECH_SERVICE) private readonly tts: TextToSpeechService,
  ) {}

  async synthesize(
    caseId: string,
    text: string,
    language: string,
    user: AuthUser,
  ) {
    const foundCase = await this.prisma.case.findFirst({
      where: { id: caseId, userId: user.id },
    })
    if (!foundCase) throw new NotFoundException(`Case ${caseId} was not found`)
    const result = await this.tts.synthesize(text, language)

    // In production, store audio in Supabase Storage
    // For local dev, return a placeholder with storageKey metadata
    const storageKey = `${caseId}/tts/${randomUUID()}.${result.extension}`

    return {
      url: `placeholder://${storageKey}`,
      expiresInSeconds: 900,
      language,
      storageKey,
    }
  }
}
