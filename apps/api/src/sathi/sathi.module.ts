import { Module } from "@nestjs/common"
import { ClassificationModule } from "../classification/classification.module"

import { GeminiProvider } from "./gemini.provider"
import { BlandService } from "./bland.service"
import { BlandWebhookController } from "./bland-webhook.controller"

import { SathiController } from "./sathi.controller"
import { SathiService } from "./sathi.service"
import { CaseInteractionsController } from "./case-interactions.controller"
import { CaseInteractionsService } from "./case-interactions.service"
import { ReportsModule } from "../reports/reports.module"
import { ProfileModule } from "../profile/profile.module"

@Module({
  imports: [ClassificationModule, ReportsModule, ProfileModule],
  controllers: [SathiController, BlandWebhookController, CaseInteractionsController],
  providers: [GeminiProvider, SathiService, BlandService, CaseInteractionsService],
})
export class SathiModule {}
