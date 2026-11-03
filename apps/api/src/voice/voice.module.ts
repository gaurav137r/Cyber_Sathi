import { Module } from "@nestjs/common"
import { BhashiniProvider } from "./bhashini.provider"
import { SPEECH_SERVICE } from "./speech-provider"
import { TEXT_TO_SPEECH_SERVICE } from "./tts-provider"
import { TtsService } from "./tts.service"
import { VoiceController } from "./voice.controller"
import { VoiceService } from "./voice.service"
import { VoiceWorkerService } from "./voice-worker.service"
import { EvidenceModule } from "../evidence/evidence.module"

@Module({
  imports: [EvidenceModule],
  controllers: [VoiceController],
  providers: [
    BhashiniProvider,
    VoiceService,
    TtsService,
    VoiceWorkerService,
    { provide: SPEECH_SERVICE, useExisting: BhashiniProvider },
    { provide: TEXT_TO_SPEECH_SERVICE, useExisting: BhashiniProvider },
  ],
})
export class VoiceModule {}
