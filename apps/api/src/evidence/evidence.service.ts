import { Inject, Injectable, NotFoundException } from "@nestjs/common"
import { randomUUID } from "node:crypto"
import { PrismaService } from "../infra/prisma.service"
import { MinioService } from "../infra/minio.service"
import { EvidenceType } from "@prisma/client"
import { AuthUser } from "../auth/auth.service"
import { EntityResolutionService } from "./entity-resolution.service"
import { OCR_SERVICE, OcrService } from "./ocr.service"
import { ExtractedEntities } from "./entity.types"
import { Prisma } from "@prisma/client"

@Injectable()
export class EvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly minio: MinioService,
    private readonly entities: EntityResolutionService,
    @Inject(OCR_SERVICE) private readonly ocr: OcrService,
  ) {}

  async upload(
    caseId: string,
    file: Express.Multer.File,
    user: AuthUser,
    requestedType?: EvidenceType,
  ) {
    const foundCase = await this.prisma.case.findFirst({
      where: { id: caseId, userId: user.id },
      include: { evidenceItems: true },
    })
    if (!foundCase) throw new NotFoundException(`Case ${caseId} was not found`)

    const objectKey = `${caseId}/${randomUUID()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`
    await this.minio.client.putObject(
      this.minio.bucket,
      objectKey,
      file.buffer,
      file.size,
      { "Content-Type": file.mimetype },
    )
    const type =
      requestedType ??
      (file.mimetype.startsWith("audio/")
        ? EvidenceType.AUDIO
        : file.mimetype.startsWith("image/")
          ? EvidenceType.IMAGE
          : file.mimetype === "application/pdf"
            ? EvidenceType.DOCUMENT
            : EvidenceType.SCREENSHOT)
    const extractedText =
      type === EvidenceType.IMAGE || type === EvidenceType.SCREENSHOT
        ? await this.ocr.extractText(file.buffer)
        : null
    const extractedEntities = extractedText
      ? this.entities.extractFromText(extractedText)
      : null
    const evidence = await this.prisma.evidenceItem.create({
      data: {
        caseId,
        storageKey: objectKey,
        type,
        extractedText,
        ...(extractedEntities
          ? { extractedEntities: extractedEntities as Prisma.InputJsonValue }
          : {}),
      },
    })
    await this.resolveCaseEntities(caseId, foundCase.rawTranscript, [
      ...foundCase.evidenceItems.map((item) => ({
        evidenceId: item.id,
        sourceType: `evidence-${item.type.toLowerCase()}`,
        entities: (item.extractedEntities ?? {}) as ExtractedEntities,
      })),
      ...(extractedEntities
        ? [
            {
              evidenceId: evidence.id,
              sourceType: `evidence-${type.toLowerCase()}`,
              entities: extractedEntities,
            },
          ]
        : []),
    ])
    await this.prisma.auditLogEntry.create({
      data: {
        caseId,
        actorUserId: user.id,
        action: "EVIDENCE_UPLOADED",
        metadata: { evidenceId: evidence.id, type },
      },
    })
    return evidence
  }

  async signedUrl(id: string, user: AuthUser): Promise<{
    id: string
    url: string
    expiresInSeconds: number
  }> {
    const evidence = await this.prisma.evidenceItem.findFirst({
      where: { id, case: { userId: user.id } },
    })
    if (!evidence) throw new NotFoundException(`Evidence ${id} was not found`)
    const expiresInSeconds = 900
    const url = await this.minio.client.presignedGetObject(
      this.minio.bucket,
      evidence.storageKey,
      expiresInSeconds,
    )
    return { id, url, expiresInSeconds }
  }

  async resolveCaseEntities(
    caseId: string,
    transcript: string | null,
    sources: Array<{
      evidenceId: string
      sourceType: string
      entities: ExtractedEntities
    }>,
  ) {
    return this.prisma.case.update({
      where: { id: caseId },
      data: {
        canonicalEntities: this.entities.merge(
          sources,
          transcript ? this.entities.extractFromText(transcript) : undefined,
        ) as Prisma.InputJsonValue,
      },
    })
  }
}
