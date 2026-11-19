import { Body, Controller, Get, NotFoundException, Param, Post, Query, Req, Res, UseGuards } from "@nestjs/common"
import { IsIn, IsString, MaxLength, IsOptional, IsEnum } from "class-validator"
import type { Response } from "express"
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger"
import { AuthUser } from "../auth/auth.service"
import { CurrentUser } from "../auth/current-user.decorator"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { ReportCompilerService } from "./report-compiler.service"
import { ReportExportService } from "./report-export.service"
import { InstagramPosterService, type InstagramPostInput } from "../gemini/instagram-poster.service"
import {
  ReportWorkflowService,
  type SocialPlatform,
  type SummaryLanguage,
} from "./report-workflow.service"

class GenerateSummaryDto {
  @IsIn(["en", "hi"])
  language: SummaryLanguage
}

class GenerateSocialDraftDto {
  @IsIn(["linkedin", "instagram", "facebook", "twitter"])
  platform: SocialPlatform

  @IsIn(["en", "hi"])
  language: SummaryLanguage
}

class CompileCaseReportDto {
  @IsString()
  @MaxLength(100)
  expectedRevision: string
}

class GenerateInstagramPosterDto {
  @IsString()
  @MaxLength(100)
  fraudType: string

  @IsString()
  @MaxLength(50)
  @IsOptional()
  amount?: string

  @IsString()
  @MaxLength(50)
  @IsOptional()
  platform?: string

  @IsString()
  @MaxLength(500)
  keyMessage: string

  @IsString()
  @MaxLength(100)
  @IsOptional()
  ctaText?: string

  @IsIn(["en", "hi"])
  language: "en" | "hi"

  @IsIn(["warning", "informational", "tip"])
  @IsOptional()
  template?: "warning" | "informational" | "tip"
}

@Controller("cases")
@UseGuards(JwtAuthGuard)
@ApiTags("reports")
@ApiBearerAuth()
export class ReportController {
  constructor(
    private readonly compiler: ReportCompilerService,
    private readonly workflow: ReportWorkflowService,
    private readonly exporter: ReportExportService,
    private readonly instagramPoster: InstagramPosterService,
  ) {}

  @Get(":id/report-center")
  @ApiOperation({ summary: "Read the latest private report summary and post drafts" })
  reportCenter(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.workflow.getReportCenter(id, user.id)
  }

  @Post(":id/report-center/summary")
  @ApiOperation({ summary: "Generate a redacted English or Hindi report summary" })
  generateSummary(
    @Param("id") id: string,
    @Body() body: GenerateSummaryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.workflow.generateSummary(id, user.id, body.language)
  }

  @Post(":id/report-center/social-draft")
  @ApiOperation({ summary: "Generate a private platform-specific social awareness draft" })
  generateSocialDraft(
    @Param("id") id: string,
    @Body() body: GenerateSocialDraftDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.workflow.generateSocialDraft(id, user.id, body.platform, body.language)
  }

  @Post(":id/instagram-poster")
  @ApiOperation({ summary: "Generate an Instagram-ready 1080x1080 awareness poster" })
  async generateInstagramPoster(
    @Param("id") id: string,
    @Body() body: GenerateInstagramPosterDto,
    @CurrentUser() user: AuthUser,
  ) {
    // Verify case ownership
    const caseRecord = await this.workflow["prisma"].case.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    })
    if (!caseRecord) {
      throw new NotFoundException("Case not found")
    }

    const input: InstagramPostInput = {
      fraudType: body.fraudType,
      amount: body.amount,
      platform: body.platform,
      keyMessage: body.keyMessage,
      ctaText: body.ctaText,
      language: body.language,
      template: body.template,
    }

    const poster = await this.instagramPoster.generatePoster(input)

    // Persist the poster so previously generated posters are retrievable
    await this.workflow["prisma"].socialPost.create({
      data: {
        caseId: id,
        platform: "instagram",
        caption: body.keyMessage,
        hashtags: [],
        imageUrl: poster.imageUrl,
      },
    })

    return { caseId: id, ...poster }
  }

  @Get(":id/report-export")
  @ApiOperation({
    summary:
      "Download the complete unredacted case report as JSON, DOCX, PDF, or text",
  })
  async exportReport(
    @Param("id") id: string,
    @Query("format") format: string | undefined,
    @Query("language") language: string | undefined,
    @CurrentUser() user: AuthUser,
    @Res() response: Response,
  ) {
    const file = await this.exporter.export(id, user.id, format, language)
    response.setHeader("Content-Type", file.contentType)
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.fileName}"`,
    )
    response.setHeader("Cache-Control", "no-store")
    response.send(file.buffer)
  }

  @Post(":id/compile-report")
  @ApiOperation({
    summary: "Compile an internal, provenance-tagged report version",
  })
  compile(
    @Param("id") id: string,
    @Body() body: CompileCaseReportDto,
    @CurrentUser() user: AuthUser,
    @Req() request: { requestId?: string },
  ) {
    return this.compiler.compile(id, user, request.requestId, body.expectedRevision)
  }
}
