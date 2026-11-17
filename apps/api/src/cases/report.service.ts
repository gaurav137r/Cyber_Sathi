import { Injectable, Logger } from '@nestjs/common'
import { OpenAIService } from '../openai/summary.service'
import { CloudflareImageService } from '../gemini/image.service'
import { PrismaService } from '../infra/prisma.service'

@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name)
  private readonly openaiService: OpenAIService
  private readonly cloudflareImageService: CloudflareImageService
  private readonly prisma: PrismaService

  constructor(
    openaiService: OpenAIService,
    cloudflareImageService: CloudflareImageService,
    prisma: PrismaService
  ) {
    this.openaiService = openaiService
    this.cloudflareImageService = cloudflareImageService
    this.prisma = prisma
  }

  async generateCompleteReport(
    caseId: string,
    language: 'hi' | 'en' = 'en'
  ) {
    this.logger.log(`Generating ${language} report for case ${caseId}`)

    // 1. Fetch evidence from database via Prisma
    const evidence = await this.prisma.evidenceItem.findFirst({
      where: { caseId: caseId as string }
    })

    if (!evidence) {
      throw new Error('Evidence not found for this case')
    }

    // 2. Build case text for AI summary
    const caseText = `
      Fraud Type: ${(evidence.extractedEntities as any)?.fraudType || 'Unknown'}
      Amount Lost: ${(evidence.extractedEntities as any)?.amountLost || 'Unknown'}
      Suspect: ${(evidence.extractedEntities as any)?.suspectName || 'Unknown'}
      UPI ID: ${(evidence.extractedEntities as any)?.upiId || 'Unknown'}
      Platform: ${(evidence.extractedEntities as any)?.platform || 'Unknown'}
    `

    // 3. Generate multilingual summary using OpenAI
    const summary = await this.openaiService.generateSummary(caseText, language)

    // 4. Generate image using Cloudflare
    const caseSummary = language === 'en' ? summary : this.translateToEnglishForSummary(summary)
    const imageUrl = await this.cloudflareImageService.generateCaseImage({
      category: (evidence.extractedEntities as any)?.fraudType || 'UPI Fraud',
      amount: (evidence.extractedEntities as any)?.amountLost || '₹2,40,000',
      suspectPhone: (evidence.extractedEntities as any)?.upiId || 'Unknown',
      suspectUpi: (evidence.extractedEntities as any)?.upiId || 'Unknown',
      suspectDetails: (evidence.extractedEntities as any)?.suspectName || 'Unknown',
      platform: (evidence.extractedEntities as any)?.platform || 'Unknown',
      incidentDate: evidence.uploadedAt ? evidence.uploadedAt.toISOString() : new Date().toISOString(),
      summary: summary
    })

    // 5. Store the generated report in database
    const reportKind = language === 'en' ? 'PUBLIC_REDACTED' : 'PUBLIC_REDACTED_HINDI'

    const report = await this.prisma.reportVersion.create({
      data: {
        caseId: caseId as string,
        version: 2, // Version 2 = AI-generated
        kind: reportKind as any,
        content: JSON.stringify({
          summary,
          summaryHindi: language === 'hi' ? summary : undefined,
          caseText,
          imagePrompt: this.cloudflareImageService['generateImagePrompt']({
            category: (evidence.extractedEntities as any)?.fraudType || 'UPI Fraud',
            amount: (evidence.extractedEntities as any)?.amountLost || '₹2,40,000',
            suspectPhone: (evidence.extractedEntities as any)?.upiId || 'Unknown',
            suspectUpi: (evidence.extractedEntities as any)?.upiId || 'Unknown',
            suspectDetails: (evidence.extractedEntities as any)?.suspectName || 'Unknown',
            platform: (evidence.extractedEntities as any)?.platform || 'Unknown',
            incidentDate: evidence.uploadedAt ? evidence.uploadedAt.toISOString() : new Date().toISOString(),
            summary
          }),
          imageUrl,
          generatedAt: new Date().toISOString
        }),
        generatedAt: new Date()
      }
    })

    return {
      reportId: report.id,
      summary,
      imageUrl,
      language,
      generatedAt: report.generatedAt
    }
  }

  private translateToEnglishForSummary(hindiSummary: string): string {
    // In a real implementation, this would use translation API
    // For now, return the original with Hindi marker
    return `[Hindi Summary] ${hindiSummary}`
  }
}