import { Module } from "@nestjs/common"
import { VoiceController } from "./voice.controller"
import { VoiceService } from "./voice.service"
import { FallbackSttService } from "./fallback-stt.service"
import { FallbackTtsService } from "./fallback-tts.service"
import { KeyPool } from "../ai/key-pool"
import { AiGateway } from "../ai/ai-gateway.service"
import { BlandService } from "../sathi/bland.service"

@Module({
  controllers: [VoiceController],
  providers: [
    VoiceService,
    FallbackSttService,
    FallbackTtsService,
    KeyPool,
    AiGateway,
    BlandService,
  ],
  exports: [VoiceService, FallbackSttService, FallbackTtsService],
})
export class VoiceModule {}