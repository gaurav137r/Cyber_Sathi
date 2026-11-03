import { Module } from "@nestjs/common"
import { GuidedBrowserProvider } from "./guided-browser.provider"
import { FilingController } from "./filing.controller"
import { FilingService } from "./filing.service"
import { PORTAL_SUBMISSION_PROVIDER } from "./portal-submission.provider"

@Module({
  controllers: [FilingController],
  providers: [
    FilingService,
    GuidedBrowserProvider,
    { provide: PORTAL_SUBMISSION_PROVIDER, useExisting: GuidedBrowserProvider },
  ],
})
export class FilingModule {}
