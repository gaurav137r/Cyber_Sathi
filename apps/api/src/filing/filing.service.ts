import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import { CaseStatus, Prisma } from "@prisma/client"
import { createHash } from "node:crypto"
import { ConfigService } from "@nestjs/config"
import { AuthUser } from "../auth/auth.service"
import { PrismaService } from "../infra/prisma.service"
import { filingRoutes } from "../classification/routing.config"
import {
  FilingPreview,
  PORTAL_SUBMISSION_PROVIDER,
  PortalSubmissionProvider,
} from "./portal-submission.provider"

export type ConfirmFilingInput = {
  previewChecksum: string
  acknowledgment: string
}

@Injectable()
export class FilingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(PORTAL_SUBMISSION_PROVIDER)
    private readonly portal: PortalSubmissionProvider,
  ) {}

  async preview(caseId: string, user: AuthUser): Promise<FilingPreview> {
    const foundCase = await this.prisma.case.findFirst({
      where: { id: caseId, userId: user.id },
      include: { evidenceItems: true },
    })
    if (!foundCase) throw new NotFoundException(`Case ${caseId} was not found`)
    const route = foundCase.category
      ? filingRoutes[(foundCase.category as keyof typeof filingRoutes)]
      : undefined
    if (!route || !route.destinationName || foundCase.category === "UNCERTAIN")
      throw new BadRequestException(
        "A concrete classified category is required before filing preview",
      )
    const destinationUrl =
      foundCase.category === "BANK_REFUND_DELAY"
        ? this.config.getOrThrow<string>("RBI_OMBUDSMAN_PORTAL_URL")
        : this.config.getOrThrow<string>("NCRP_PORTAL_URL")
    const submissionData = {
      caseId: foundCase.id,
      category: foundCase.category,
      categoryConfidence: foundCase.categoryConfidence,
      detectedLanguage: foundCase.detectedLanguage,
      transcript: foundCase.canonicalTranscript ?? foundCase.rawTranscript,
      structuredFields: foundCase.structuredFields,
      canonicalEntities: foundCase.canonicalEntities,
      evidence: foundCase.evidenceItems.map((item) => ({
        id: item.id,
        type: item.type,
        extractedText: item.extractedText,
        extractedEntities: item.extractedEntities,
      })),
    }
    const previewChecksum = this.checksum(submissionData)
    return {
      caseId,
      destinationName: route.destinationName,
      destinationUrl,
      explanation: route.guidance,
      submissionData,
      previewChecksum,
    }
  }

  async confirm(
    caseId: string,
    input: ConfirmFilingInput,
    user: AuthUser,
    requestId?: string,
  ) {
    const preview = await this.preview(caseId, user)
    if (
      preview.previewChecksum !== input.previewChecksum ||
      input.acknowledgment !== `I_REVIEWED_PREVIEW:${preview.previewChecksum}`
    )
      throw new BadRequestException(
        "Confirmation does not match the current filing preview",
      )
    const current = await this.prisma.case.findFirst({
      where: { id: caseId, userId: user.id },
    })
    if (!current) throw new NotFoundException(`Case ${caseId} was not found`)
    if (current.status !== CaseStatus.REVIEWED)
      throw new BadRequestException(
        `Case must be REVIEWED before filing confirmation; current status is ${current.status}`,
      )
    const handoff = await this.portal.createGuidedHandoff(preview)
    const updated = await this.prisma.case.update({
      where: { id: caseId },
      data: { status: CaseStatus.FILED },
    })
    await this.prisma.auditLogEntry.create({
      data: {
        caseId,
        actorUserId: user.id,
        action: "FILING_CONFIRMED_GUIDED_HANDOFF",
        metadata: {
          requestId,
          previewChecksum: preview.previewChecksum,
          acknowledgment: input.acknowledgment,
          exactPreview: preview,
          handoff,
        } as Prisma.InputJsonValue,
      },
    })
    return { case: updated, preview, handoff, submittedAutomatically: false }
  }

  async recordTracking(
    caseId: string,
    trackingNumber: string,
    user: AuthUser,
    requestId?: string,
  ) {
    const value = trackingNumber.trim()
    if (!value || value.length > 120)
      throw new BadRequestException("A valid tracking number is required")
    const foundCase = await this.prisma.case.findFirst({
      where: { id: caseId, userId: user.id },
    })
    if (!foundCase) throw new NotFoundException(`Case ${caseId} was not found`)
    const updated = await this.prisma.case.update({
      where: { id: caseId },
      data: { trackingNumber: value },
    })
    await this.prisma.auditLogEntry.create({
      data: {
        caseId,
        actorUserId: user.id,
        action: "TRACKING_NUMBER_RECORDED",
        metadata: { requestId, trackingNumber: value },
      },
    })
    return updated
  }

  private checksum(value: unknown): string {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex")
  }
}
