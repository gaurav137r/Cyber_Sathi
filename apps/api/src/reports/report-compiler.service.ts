import { Injectable, NotFoundException } from "@nestjs/common"
import { Prisma, ReportKind } from "@prisma/client"
import { AuthUser } from "../auth/auth.service"
import { PrismaService } from "../infra/prisma.service"

@Injectable()
export class ReportCompilerService {
  constructor(private readonly prisma: PrismaService) {}

  async compile(caseId: string, user: AuthUser, requestId?: string) {
    const foundCase = await this.prisma.case.findFirst({
      where: { id: caseId, userId: user.id },
      include: { evidenceItems: true },
    })
    if (!foundCase) throw new NotFoundException(`Case ${caseId} was not found`)
    const structured = foundCase.structuredFields as Record<string, unknown>
    const field = (
      value: unknown,
      source: "user-stated" | "AI-inferred" | "evidence-corroborated",
    ) => ({ value: value ?? null, source })
    const content = {
      schemaVersion: "1.0",
      caseId,
      category: field(
        foundCase.category,
        foundCase.category ? "AI-inferred" : "user-stated",
      ),
      categoryConfidence: field(foundCase.categoryConfidence, "AI-inferred"),
      explanation: field(foundCase.classificationExplanation, "AI-inferred"),
      detectedLanguage: field(foundCase.detectedLanguage, "AI-inferred"),
      transcript: field(foundCase.rawTranscript, "user-stated"),
      canonicalTranscript: field(foundCase.canonicalTranscript, "AI-inferred"),
      structuredFields: Object.fromEntries(
        Object.entries(structured).map(([key, value]) => [
          key,
          field(value, key === "description" ? "user-stated" : "AI-inferred"),
        ]),
      ),
      canonicalEntities: foundCase.canonicalEntities,
      evidence: foundCase.evidenceItems.map((item) => ({
        id: item.id,
        type: item.type,
        extractedText: field(item.extractedText, "evidence-corroborated"),
        entities: item.extractedEntities,
      })),
      narrative: this.narrative(
        foundCase.category,
        structured,
        foundCase.rawTranscript,
      ),
    }
    const latest = await this.prisma.reportVersion.findFirst({
      where: { caseId, kind: ReportKind.INTERNAL },
      orderBy: { version: "desc" },
    })
    const report = await this.prisma.reportVersion.create({
      data: {
        caseId,
        version: (latest?.version ?? 0) + 1,
        kind: ReportKind.INTERNAL,
        content: content as Prisma.InputJsonValue,
      },
    })
    await this.prisma.auditLogEntry.create({
      data: {
        caseId,
        actorUserId: user.id,
        action: "INTERNAL_REPORT_COMPILED",
        metadata: { requestId, reportVersionId: report.id },
      },
    })
    return report
  }

  private narrative(
    category: string | null,
    fields: Record<string, unknown>,
    transcript: string | null,
  ): string {
    const amount = fields.amount ? ` involving ₹${fields.amount}` : ""
    const app = fields.bankOrApp ? ` involving ${fields.bankOrApp}` : ""
    return `This report concerns a suspected ${category ?? "unclassified cyber-fraud incident"}${amount}${app}. ${fields.description ?? transcript ?? "No narrative was provided."}`
  }
}
