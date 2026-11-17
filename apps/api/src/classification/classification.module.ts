import { Module } from "@nestjs/common"
import { OpenAiClassificationProvider } from "./openai-classification.provider"
import { CLASSIFICATION_SERVICE } from "./classification-provider"
import { ClassificationController } from "./classification.controller"
import { ClassificationOrchestrator } from "./classification.service"

@Module({
  controllers: [ClassificationController],
  providers: [
    OpenAiClassificationProvider,
    ClassificationOrchestrator,
    {
      provide: CLASSIFICATION_SERVICE,
      useExisting: OpenAiClassificationProvider,
    },
  ],
  exports: [ClassificationOrchestrator],
})
export class ClassificationModule {}
