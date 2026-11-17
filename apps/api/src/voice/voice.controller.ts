import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
  Param,
  Get,
  HttpCode,
  HttpStatus,
} from "@nestjs/common"
import type { Request } from "express"
import { ApiBearerAuth, ApiOperation, ApiTags, ApiConsumes, ApiBody } from "@nestjs/swagger"
import { AuthUser } from "../auth/auth.service"
import { CurrentUser } from "../auth/current-user.decorator"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { IsOptional, IsString, MaxLength } from "class-validator"
import { VoiceService, VoiceMode, VoiceTurnResult } from "./voice.service"
import { FallbackSttService, SttResult } from "./fallback-stt.service"
import { FallbackTtsService, TtsResult } from "./fallback-tts.service"

class StartVoiceSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string
}

class VoiceTurnDto {
  audioBase64: string
  mimeType: string
}

class TtsRequestDto {
  text: string
  language?: "hi" | "en"
}

@Controller("cases/:id/voice")
@UseGuards(JwtAuthGuard)
@ApiTags("voice")
@ApiBearerAuth()
export class VoiceController {
  constructor(
    private readonly voice: VoiceService,
    private readonly stt: FallbackSttService,
    private readonly tts: FallbackTtsService,
  ) {}

  @Post("session")
  @ApiOperation({ summary: "Start a voice session (tries Bland first, falls back)" })
  async startSession(
    @Param("id") caseId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: StartVoiceSessionDto,
  ) {
    const session = await this.voice.startSession(caseId, user.id, body.language || "hi", {} as any)
    return {
      mode: session.mode,
      sessionToken: session.blandSessionToken,
      authorization: session.blandSessionToken,
      message: session.mode === "fallback" ? "Fallback voice active — quality may vary" : undefined,
    }
  }

  @Post("turn")
  @ApiOperation({ summary: "Process a voice turn (audio in, text+audio out)" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        audio: { type: "string", format: "binary" },
      },
    },
  })
  async processTurn(
    @Param("id") caseId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ): Promise<VoiceTurnResult> {
    // Handle multipart form data with audio file
    const contentType = req.headers["content-type"] || ""
    if (!contentType.includes("multipart/form-data")) {
      return {
        mode: "text-only",
        text: "Audio file required",
        error: "Expected multipart/form-data with audio file",
      }
    }

    // For simplicity, expecting base64 in body (adjust for actual file upload handling)
    const body = req.body as any
    if (!body.audioBase64) {
      return {
        mode: "text-only",
        text: "Audio data required",
        error: "No audioBase64 in request",
      }
    }

    const audioBuffer = Buffer.from(body.audioBase64, "base64")
    const mimeType = body.mimeType || "audio/webm"

    return this.voice.processVoiceTurn(caseId, user.id, audioBuffer, mimeType)
  }

  @Post("stt")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Transcribe audio using fallback STT (Groq → Cloudflare)" })
  async transcribe(
    @Param("id") caseId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: VoiceTurnDto,
  ): Promise<SttResult> {
    const audioBuffer = Buffer.from(body.audioBase64, "base64")
    return this.stt.transcribe(audioBuffer, body.mimeType)
  }

  @Post("tts")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Synthesize speech using fallback TTS (Fish → Google)" })
  async synthesize(
    @Param("id") caseId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: TtsRequestDto,
  ): Promise<TtsResult> {
    return this.tts.synthesize(body.text, body.language || "hi")
  }

  @Get("session")
  @ApiOperation({ summary: "Get current voice session status" })
  getSession(
    @Param("id") caseId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const session = this.voice.getSession(caseId, user.id)
    if (!session) return { active: false }
    return {
      active: true,
      mode: session.mode,
      fallbackTurnCount: session.fallbackTurnCount,
      language: session.language,
    }
  }
}