import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common"

import { FileInterceptor } from "@nestjs/platform-express"

import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger"

import { AuthUser } from "../auth/auth.service"

import { CurrentUser } from "../auth/current-user.decorator"

import { JwtAuthGuard } from "../auth/jwt-auth.guard"

import {
  DeviceContextDto,
  SathiTranscriptDto,
  SathiSpeechDto,
  SathiTurnQueryDto,
  StartSathiSessionDto,
} from "./sathi.dto"

import { SathiService } from "./sathi.service"

import { ProfileService } from "../profile/profile.service"

import { BlandService } from "./bland.service"

@Controller()
@UseGuards(JwtAuthGuard)
@ApiTags("sathi")
@ApiBearerAuth()
export class SathiController {
  constructor(
    private readonly sathi: SathiService,
    private readonly bland: BlandService,
    private readonly profile: ProfileService,
  ) {}

  @Post("cases/:id/bland/session")
  @ApiOperation({ summary: "Create a Bland AI voice session token for a case" })
  blandSession(
    @Param("id") id: string,
    @Body() body: { language?: string } = {},
    @CurrentUser() user: AuthUser,
  ) {
    return this.bland.createSessionToken(id, user.id, body?.language)
  }

  @Post("sathi/session")

  @ApiOperation({
    summary: "Create a case and start a Sathi Gemini voice session",
  })
  startNew(
  @Body() body: StartSathiSessionDto = {},
    @CurrentUser() user: AuthUser,
  ) {
    return this.sathi.startNewSession(user, body.language)
  }

  @Post("cases/:id/sathi/session")

  @ApiOperation({
    summary: "Start or resume a Sathi Gemini live voice session for a case",
  })
  start(
    @Param("id") id: string,
    @Body() body: StartSathiSessionDto = {},
    @CurrentUser() user: AuthUser,
  ) {
    return this.sathi.startSession(id, user, body.language)
  }

  @Get("cases/:id/sathi")

  @ApiOperation({ summary: "Read the current Sathi intake state" })
  state(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.sathi.state(id, user)
  }

  @Post("cases/:id/sathi/transcript")
  @ApiOperation({ summary: "Persist a display transcript from the live voice provider" })
  transcript(
    @Param("id") id: string,
    @Body() body: SathiTranscriptDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sathi.recordTranscript(id, user, body.role, body.text)
  }

  @Post("cases/:id/sathi/speech")
  @ApiOperation({ summary: "Generate Sathi's spoken reply with Gemini TTS" })
  speech(
    @Param("id") id: string,
    @Body() body: SathiSpeechDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sathi.speech(id, user, body.text, body.language || "en")
  }

  @Post("cases/:id/sathi/turns")

  @UseInterceptors(
    FileInterceptor("audio", { limits: { fileSize: 25 * 1024 * 1024 } }),
  )

  @ApiConsumes("multipart/form-data")

  @ApiOperation({ summary: "Send a voice or text turn to Sathi" })
  turn(
    @Param("id") id: string,

    @Query() query: SathiTurnQueryDto,

    @Body() body: SathiTurnQueryDto,

    @UploadedFile() audio: Express.Multer.File | undefined,

    @CurrentUser() user: AuthUser,
  ) {
    if (!audio && !body.text && !query.text)
      throw new BadRequestException(
        'A multipart audio field named "audio" or a text query is required',
      )

    return this.sathi.turn(id, user, {
      text: body.text ?? query.text,
      language: query.language,
      audio,
    })
  }

  @Post("cases/:id/sathi/device-context")

  @ApiOperation({
    summary: "Submit the phone number the user chose from call/SMS context",
  })
  deviceContext(
    @Param("id") id: string,
    @Body() body: DeviceContextDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sathi.submitDeviceContext(id, user, body)
  }

  @Get("cases/:id/sathi/context")

  @ApiOperation({
    summary: "Return the user's profile as voice-agent session context",
  })
  sathiContext(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
  ) {
    // The case id establishes the session; context itself is the user's profile.
    return this.profile.getSathiContext(user.supabaseId ?? user.id)
  }
}
