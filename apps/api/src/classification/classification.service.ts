import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import { CaseStatus, Prisma } from "@prisma/client"
import { AuthUser } from "../auth/auth.service"
import { PrismaService } from "../infra/prisma.service"
import { ConfigService } from "@nestjs/config"
import {
  CLASSIFICATION_SERVICE,
  ClassificationService,
} from "./classification-provider"
import { classificationOutputSchema } from "./classification.types"
import { filingRoutes } from "./routing.config"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

@Injectable()
export class ClassificationOrchestrator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(CLASSIFICATION_SERVICE)
    private readonly classifier: ClassificationService,
  ) {}

  async classify(
    caseId: string,
    user: Pick<AuthUser, "id">,
    requestId?: string,
  ) {
    const foundCase = await this.prisma.case.findFirst({
      where: { id: caseId, userId: user.id },
      include: { evidenceItems: true },
    })
    if (!foundCase) throw new NotFoundException(`Case ${caseId} was not found`)
    if (!foundCase.canonicalTranscript && !foundCase.rawTranscript)
      throw new BadRequestException("Case has no transcript to classify")
    const result = classificationOutputSchema.parse(
      await this.classifier.classify({
        canonicalTranscript:
          foundCase.canonicalTranscript ?? foundCase.rawTranscript ?? "",
        extractedEntities: foundCase.structuredFields,
      }),
    )
    const threshold = this.config.getOrThrow<number>(
      "CLASSIFICATION_CONFIDENCE_THRESHOLD",
    )
    const currentFields = isRecord(foundCase.structuredFields)
      ? foundCase.structuredFields
      : {}
    const confirmedFields = isRecord(currentFields.confirmedFields)
      ? currentFields.confirmedFields
      : {}
    const hasConfirmedCategory =
      typeof confirmedFields.category === "string" &&
      confirmedFields.category in filingRoutes &&
      confirmedFields.category !== "UNCERTAIN"
    const needsClarification =
      !hasConfirmedCategory &&
      (result.confidence < threshold || result.category === "UNCERTAIN")
    const category = hasConfirmedCategory
      ? (confirmedFields.category as keyof typeof filingRoutes)
      : needsClarification
        ? "UNCERTAIN"
        : result.category
    const route = filingRoutes[category]
    const extractedCandidates = isRecord(currentFields.extractedCandidates)
      ? currentFields.extractedCandidates
      : {}
    const safeExtractedFields = Object.fromEntries(
      Object.entries(result.extractedFields).filter(
        ([field]) => !Object.prototype.hasOwnProperty.call(confirmedFields, field),
      ),
    )
    const structuredFields = {
      ...currentFields,
      ...safeExtractedFields,
      extractedCandidates: {
        ...extractedCandidates,
        ...result.extractedFields,
      },
      confirmedFields,
    }

    const updated = await this.prisma.case.update({
      where: { id: caseId },
      data: {
        category,
        categoryConfidence: result.confidence,
        classificationExplanation: result.explanation,
        clarificationRequired: needsClarification,
        needsHuman: needsClarification,
        filingDestination: route.destinationName,
        structuredFields: structuredFields as Prisma.InputJsonValue,
        ...(needsClarification ? {} : { status: CaseStatus.CLASSIFIED }),
      },
    })
    await this.prisma.auditLogEntry.create({
      data: {
        caseId,
        actorUserId: user.id,
        action: "CASE_CLASSIFIED",
        metadata: {
          requestId,
          category,
          confidence: result.confidence,
          clarificationRequired: needsClarification,
        } as Prisma.InputJsonValue,
      },
    })
    return {
      case: updated,
      classification: result,
      route,
      clarificationRequired: needsClarification,
    }
  }

  async classifyFromWebhook(caseId: string) {
    const foundCase = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: { userId: true },
    })
    if (!foundCase) throw new NotFoundException(`Case ${caseId} was not found`)
    return this.classify(caseId, { id: foundCase.userId })
  }

  async completeClarification(
    caseId: string,
    user: AuthUser,
    category: string,
    requestId?: string,
  ) {
    const foundCase = await this.prisma.case.findFirst({
      where: { id: caseId, userId: user.id },
    })
    if (!foundCase) throw new NotFoundException(`Case ${caseId} was not found`)
    if (!(category in filingRoutes) || category === "UNCERTAIN")
      throw new BadRequestException(
        "Clarification must select a concrete filing category",
      )
    const updated = await this.prisma.case.update({
      where: { id: caseId },
      data: {
        category,
        categoryConfidence: 1,
        classificationExplanation:
          "Category confirmed by the user during clarification.",
        clarificationRequired: false,
        filingDestination:
          filingRoutes[(category as keyof typeof filingRoutes)].destinationName,
      },
    })
    await this.prisma.auditLogEntry.create({
      data: {
        caseId,
        actorUserId: user.id,
        action: "CASE_CLARIFICATION_COMPLETED",
        metadata: { requestId, category },
      },
    })
    return updated
  }
}
