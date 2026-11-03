import { Inject, Injectable, NotFoundException } from "@nestjs/common"
import { randomUUID } from "node:crypto"
import { AuthUser } from "../auth/auth.service"
import { MinioService } from "../infra/minio.service"
import { PrismaService } from "../infra/prisma.service"
import { TEXT_TO_SPEECH_SERVICE, TextToSpeechService } from "./tts-provider"

@Injectable()
export class TtsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly minio: MinioService,
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
    const storageKey = `${caseId}/tts/${randomUUID()}.${result.extension}`
    await this.minio.client.putObject(
      this.minio.bucket,
      storageKey,
      result.audio,
      result.audio.length,
      { "Content-Type": result.contentType },
    )
    const expiresInSeconds = 900
    const url = await this.minio.client.presignedGetObject(
      this.minio.bucket,
      storageKey,
      expiresInSeconds,
    )
    return { url, expiresInSeconds, language }
  }
}
