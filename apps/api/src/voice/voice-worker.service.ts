import { Inject, Injectable, NotFoundException } from "@nestjs/common"
import { randomUUID } from "node:crypto"
import { CaseStatus, EvidenceType, Prisma } from "@prisma/client"
import { StructuredLogger } from "../logging/structured-logger.service"
import { SPEECH_SERVICE, SpeechService } from "./speech-provider"
import { EntityResolutionService } from "../evidence/entity-resolution.service"
import { ExtractedEntities } from "../evidence/entity.types"
import { PrismaService } from "../infra/prisma.service"

@Injectable()
export class VoiceWorkerService {
  private readonly progressStore = new Map<string, {
    stage: string
    percent: number
  }>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: StructuredLogger,
    private readonly entities: EntityResolutionService,
    @Inject(SPEECH_SERVICE) private readonly speech: SpeechService,
  ) {}

  async start() {
    // In production, this would start a BullMQ worker
    // For local dev, we simulate the worker behavior
    this.logger.info({ message: "Voice worker ready" }, "Voice worker started")
  }

  async stop() {
    this.progressStore.clear()
    this.logger.info(
      { message: "Voice worker stopped" },
      "Voice worker stopped",
    )
  }

  async processJob(job: {
    id: string
    data: {
      caseId: string
      evidenceId: string
      userId: string
      languageHint?: string
      requestId?: string
    }
  }): Promise<void> {
    const progressStore = this.progressStore
    const progress = progressStore.get(job.id)

    await progressStore.set(job.id, { stage: "downloading_audio", percent: 15 })

    // Simulate audio download (in production, download from Supabase Storage)
    // For local dev, we simulate with mock data
    const mockTranscript = "Mock transcript for local development"

    await progressStore.set(job.id, { stage: "transcribing", percent: 40 })

    const result = await this.speech.transcribe(
      Buffer.from(mockTranscript),
      job.data.languageHint,
    )

    await progressStore.set(job.id, {
      stage: "storing_transcript",
      percent: 85,
    })

    const extractedEntities = this.entities.extractFromText(result.transcript)

    await this.prisma.evidenceItem.update({
      where: { id: job.data.evidenceId },
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

    await progressStore.set(job.id, {
      stage: "ready_for_classification",
      percent: 100,
    })

    this.logger.info(
      { jobId: job.id, caseId: job.data.caseId },
      "voice transcription completed",
    )
  }

  async close(): Promise<void> {
    this.progressStore.clear()
  }
}
