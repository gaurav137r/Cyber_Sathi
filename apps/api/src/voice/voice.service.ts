import { Inject, Injectable, NotFoundException } from "@nestjs/common"
import { Job, Queue } from "bullmq"
import { randomUUID } from "node:crypto"
import { CaseStatus, EvidenceType, Prisma } from "@prisma/client"
import { AuthUser } from "../auth/auth.service"
import { MinioService } from "../infra/minio.service"
import { PrismaService } from "../infra/prisma.service"
import { RedisService } from "../infra/redis.service"
import { StructuredLogger } from "../logging/structured-logger.service"
import { SPEECH_SERVICE, SpeechService } from "./speech-provider"
import { EntityResolutionService } from "../evidence/entity-resolution.service"
import { ExtractedEntities } from "../evidence/entity.types"

export const VOICE_QUEUE = "voice-intake"

@Injectable()
export class VoiceService {
  private readonly queue: Queue

  constructor(
    private readonly prisma: PrismaService,
    private readonly minio: MinioService,
    private readonly redis: RedisService,
    private readonly logger: StructuredLogger,
    private readonly entities: EntityResolutionService,
    @Inject(SPEECH_SERVICE) private readonly speech: SpeechService,
  ) {
    this.queue = new Queue(VOICE_QUEUE, { connection: redis.client })
  }

  async enqueue(
    caseId: string,
    file: Express.Multer.File,
    user: AuthUser,
    languageHint?: string,
    requestId?: string,
  ) {
    const foundCase = await this.prisma.case.findFirst({
      where: { id: caseId, userId: user.id },
    })
    if (!foundCase) throw new NotFoundException(`Case ${caseId} was not found`)
    const storageKey = `${caseId}/audio/${randomUUID()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`
    await this.minio.client.putObject(
      this.minio.bucket,
      storageKey,
      file.buffer,
      file.size,
      { "Content-Type": file.mimetype },
    )
    const evidence = await this.prisma.evidenceItem.create({
      data: { caseId, type: EvidenceType.AUDIO, storageKey },
    })
    await this.prisma.case.update({
      where: { id: caseId },
      data: { status: CaseStatus.PROCESSING },
    })
    await this.prisma.auditLogEntry.create({
      data: {
        caseId,
        actorUserId: user.id,
        action: "VOICE_INTAKE_QUEUED",
        metadata: { requestId, evidenceId: evidence.id },
      },
    })
    const job = await this.queue.add(
      "transcribe",
      {
        caseId,
        evidenceId: evidence.id,
        userId: user.id,
        languageHint,
        requestId,
      },
      { removeOnComplete: 100, removeOnFail: 100 },
    )
    await this.setProgress(job.id!, caseId, "queued", 0)
    return {
      jobId: job.id,
      caseId,
      evidenceId: evidence.id,
      status: CaseStatus.PROCESSING,
    }
  }

  async progress(caseId: string, jobId: string, user: AuthUser) {
    const foundCase = await this.prisma.case.findFirst({
      where: { id: caseId, userId: user.id },
    })
    if (!foundCase) throw new NotFoundException(`Case ${caseId} was not found`)
    const stored = await this.redis.client.get(this.progressKey(jobId))
    const job = await this.queue.getJob(jobId)
    return {
      jobId,
      caseId,
      state: job ? await job.getState() : "unknown",
      progress: stored ? JSON.parse(stored) : { stage: "unknown", percent: 0 },
    }
  }

  async run(
    job: Job<{
      caseId: string
      evidenceId: string
      userId: string
      languageHint?: string
      requestId?: string
    }>,
  ) {
    const update = (stage: string, percent: number) =>
      this.setProgress(job.id!, job.data.caseId, stage, percent)
    await update("downloading_audio", 15)
    const evidence = await this.prisma.evidenceItem.findUniqueOrThrow({
      where: { id: job.data.evidenceId },
    })
    const stream = await this.minio.client.getObject(
      this.minio.bucket,
      evidence.storageKey,
    )
    const chunks: Buffer[] = []
    for await (const chunk of stream)
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    await update("transcribing", 40)
    const result = await this.speech.transcribe(
      Buffer.concat(chunks),
      job.data.languageHint,
    )
    await update("storing_transcript", 85)
    const extractedEntities = this.entities.extractFromText(result.transcript)
    await this.prisma.evidenceItem.update({
      where: { id: evidence.id },
      data: {
        extractedText: result.transcript,
        extractedEntities: extractedEntities as Prisma.InputJsonValue,
      },
    })
    await this.prisma.case.update({
      where: { id: job.data.caseId },
      data: {
        rawTranscript: result.transcript,
        canonicalTranscript: result.canonicalTranscript,
        detectedLanguage: result.detectedLanguage,
        status: CaseStatus.PROCESSING,
      },
    })
    const evidenceItems = await this.prisma.evidenceItem.findMany({
      where: { caseId: job.data.caseId },
    })
    await this.prisma.case.update({
      where: { id: job.data.caseId },
      data: {
        canonicalEntities: this.entities.merge(
          evidenceItems.map((item) => ({
            evidenceId: item.id,
            sourceType: `evidence-${item.type.toLowerCase()}`,
            entities: (item.extractedEntities ?? {}) as ExtractedEntities,
          })),
          this.entities.extractFromText(result.transcript),
        ) as Prisma.InputJsonValue,
      },
    })
    await this.prisma.auditLogEntry.create({
      data: {
        caseId: job.data.caseId,
        actorUserId: job.data.userId,
        action: "VOICE_TRANSCRIBED",
        metadata: {
          requestId: job.data.requestId,
          language: result.detectedLanguage,
        } as Prisma.InputJsonValue,
      },
    })
    await update("ready_for_classification", 100)
    this.logger.info(
      { requestId: job.data.requestId, jobId: job.id, caseId: job.data.caseId },
      "voice transcription completed",
    )
    return result
  }

  async close(): Promise<void> {
    await this.queue.close()
  }
  private progressKey(jobId: string): string {
    return `voice:progress:${jobId}`
  }
  private async setProgress(
    jobId: string,
    caseId: string,
    stage: string,
    percent: number,
  ): Promise<void> {
    await this.redis.client.set(
      this.progressKey(jobId),
      JSON.stringify({ caseId, stage, percent }),
      "EX",
      86400,
    )
  }
}
