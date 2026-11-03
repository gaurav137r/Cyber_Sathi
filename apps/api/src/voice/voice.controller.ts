import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common"
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger"
import { FileInterceptor } from "@nestjs/platform-express"
import { AuthUser } from "../auth/auth.service"
import { CurrentUser } from "../auth/current-user.decorator"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { SummaryAudioDto, VoiceIntakeQueryDto } from "./voice.dto"
import { VoiceService } from "./voice.service"
import { TtsService } from "./tts.service"

@Controller("cases")
@UseGuards(JwtAuthGuard)
@ApiTags("voice")
@ApiBearerAuth()
export class VoiceController {
  constructor(
    private readonly voice: VoiceService,
    private readonly tts: TtsService,
  ) {}

  @Post(":id/voice-intake")
  @UseInterceptors(
    FileInterceptor("audio", { limits: { fileSize: 25 * 1024 * 1024 } }),
  )
  @ApiConsumes("multipart/form-data")
  @ApiOperation({
    summary: "Upload audio and enqueue asynchronous transcription",
  })
  voiceIntake(
    @Param("id") id: string,
    @Query() query: VoiceIntakeQueryDto,
    @UploadedFile() audio: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUser,
    @Req() request: { requestId?: string },
  ) {
    if (!audio)
      throw new BadRequestException(
        'A multipart audio field named "audio" is required',
      )
    return this.voice.enqueue(
      id,
      audio,
      user,
      query.language,
      request.requestId,
    )
  }

  @Get(":id/voice-intake/:jobId")
  @ApiOperation({ summary: "Poll asynchronous transcription progress" })
  progress(
    @Param("id") id: string,
    @Param("jobId") jobId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.voice.progress(id, jobId, user)
  }

  @Post(":id/summary/audio")
  @ApiOperation({ summary: "Generate and return a signed summary-audio URL" })
  summaryAudio(
    @Param("id") id: string,
    @Body() body: SummaryAudioDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tts.synthesize(id, body.text, body.language, user)
  }
}
