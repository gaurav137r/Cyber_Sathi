import { Module } from "@nestjs/common"
import { ReportController } from "./report.controller"
import { ReportCompilerService } from "./report-compiler.service"
import { ReportExportService } from "./report-export.service"
import { OpenAIService } from "../openai/summary.service"
import { CloudflareImageService } from "../gemini/image.service"
import { InstagramPosterService } from "../gemini/instagram-poster.service"
import { ReportWorkflowService } from "./report-workflow.service"
import { AiPipelineTestController } from "./ai-pipeline-test.controller"
import { AiPipelineTestService } from "./ai-pipeline-test.service"

@Module({
  controllers: [ReportController, AiPipelineTestController],
  providers: [ReportCompilerService, ReportWorkflowService, ReportExportService, OpenAIService, CloudflareImageService, InstagramPosterService, AiPipelineTestService],
  exports: [ReportCompilerService, ReportWorkflowService, ReportExportService, OpenAIService, CloudflareImageService, InstagramPosterService],
})
export class ReportsModule {}
