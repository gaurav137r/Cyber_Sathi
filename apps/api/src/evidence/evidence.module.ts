import { Module } from "@nestjs/common"
import {
  CaseEvidenceController,
  EvidenceController,
} from "./evidence.controller"
import { EvidenceService } from "./evidence.service"
import { EntityResolutionService } from "./entity-resolution.service"
import { OCR_SERVICE } from "./ocr.service"
import { TesseractOcrProvider } from "./ocr.service"

@Module({
  controllers: [EvidenceController, CaseEvidenceController],
  providers: [
    EvidenceService,
    EntityResolutionService,
    TesseractOcrProvider,
    { provide: OCR_SERVICE, useExisting: TesseractOcrProvider },
  ],
  exports: [EntityResolutionService],
})
export class EvidenceModule {}
