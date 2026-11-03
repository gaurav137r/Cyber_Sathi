import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import { Case, CaseStatus, Prisma } from "@prisma/client"
import { PrismaService } from "../infra/prisma.service"
import { AuthUser } from "../auth/auth.service"
import { CreateCaseDto, TransitionCaseDto, UpdateCaseDto } from "./case.dto"
import { ConfigService } from "@nestjs/config"

const transitions: Record<CaseStatus, CaseStatus[]> = {
  DRAFT: [CaseStatus.PROCESSING, CaseStatus.ARCHIVED],
  PROCESSING: [CaseStatus.CLASSIFIED, CaseStatus.ARCHIVED],
  CLASSIFIED: [CaseStatus.REVIEWED, CaseStatus.ARCHIVED],
  REVIEWED: [CaseStatus.FILED, CaseStatus.ARCHIVED],
  FILED: [CaseStatus.RESOLVED, CaseStatus.ARCHIVED],
  RESOLVED: [CaseStatus.ARCHIVED],
  ARCHIVED: [],
}

@Injectable()
export class CaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async create(
    input: CreateCaseDto,
    user: AuthUser,
    requestId?: string,
  ): Promise<Case> {
    const created = await this.prisma.case.create({
      data: {
        userId: user.id,
        category: input.category,
        detectedLanguage: input.detectedLanguage,
        rawTranscript: input.rawTranscript,
        structuredFields: (input.structuredFields ??
          {}) as Prisma.InputJsonValue,
        canonicalEntities: {} as Prisma.InputJsonValue,
      },
    })
    await this.audit(created.id, user.id, "CASE_CREATED", { requestId })
    return created
  }

  async update(
    id: string,
    input: UpdateCaseDto,
    user: AuthUser,
    requestId?: string,
  ): Promise<Case> {
    const existing = await this.findOne(id, user.id)
    const updated = await this.prisma.case.update({
      where: { id: existing.id },
      data: {
        category: input.category,
        categoryConfidence: input.categoryConfidence,
        detectedLanguage: input.detectedLanguage,
        rawTranscript: input.rawTranscript,
        filingDestination: input.filingDestination,
        trackingNumber: input.trackingNumber,
        ...(input.structuredFields
          ? {
              structuredFields: input.structuredFields as Prisma.InputJsonValue,
            }
          : {}),
      },
    })
    await this.audit(id, user.id, "CASE_UPDATED", {
      requestId,
      fields: Object.keys(input),
    })
    return updated
  }

  async transition(
    id: string,
    input: TransitionCaseDto,
    user: AuthUser,
    requestId?: string,
  ): Promise<Case> {
    const existing = await this.findOne(id, user.id)
    const next = input.status as CaseStatus
    if (
      !Object.values(CaseStatus).includes(next) ||
      !transitions[existing.status].includes(next)
    )
      throw new BadRequestException(
        `Invalid case transition: ${existing.status} -> ${input.status}`,
      )
    if (
      next === CaseStatus.CLASSIFIED &&
      (existing.clarificationRequired ||
        existing.category === "UNCERTAIN" ||
        (existing.categoryConfidence ?? 0) <
          this.config.getOrThrow<number>("CLASSIFICATION_CONFIDENCE_THRESHOLD"))
    )
      throw new BadRequestException(
        "Manual clarification is required before this case can be classified",
      )
    const updated = await this.prisma.case.update({
      where: { id },
      data: { status: next },
    })
    await this.audit(id, user.id, "CASE_TRANSITIONED", {
      requestId,
      from: existing.status,
      to: next,
      reason: input.reason,
    })
    return updated
  }

  async findOne(id: string, userId?: string): Promise<Case> {
    const found = await this.prisma.case.findFirst({
      where: { id, ...(userId ? { userId } : {}) },
    })
    if (!found) throw new NotFoundException(`Case ${id} was not found`)
    return found
  }

  async get(id: string, userId?: string): Promise<Case> {
    return this.findOne(id, userId)
  }

  async touchUpdatedAt(id: string): Promise<Case> {
    await this.findOne(id)
    return this.prisma.case.update({
      where: { id },
      data: { updatedAt: new Date() },
    })
  }

  async findAll(userId: string): Promise<Case[]> {
    return this.prisma.case.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    })
  }

  private audit(
    caseId: string,
    actorUserId: string,
    action: string,
    metadata: Record<string, unknown>,
  ) {
    return this.prisma.auditLogEntry.create({
      data: {
        caseId,
        actorUserId,
        action,
        metadata: metadata as Prisma.InputJsonValue,
      },
    })
  }
}
