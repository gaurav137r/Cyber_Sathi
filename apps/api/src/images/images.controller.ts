import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import type { Response } from "express"
import { AuthUser } from "../auth/auth.service"
import { CurrentUser } from "../auth/current-user.decorator"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import {
  GenerateBackgroundDto,
  GeneratePosterDto,
  ImageFileQueryDto,
  RenderPosterDto,
} from "./images.dto"
import { ImagesService } from "./images.service"

@Controller()
@UseGuards(JwtAuthGuard)
@ApiTags("images")
@ApiBearerAuth()
export class ImagesController {
  constructor(private readonly images: ImagesService) {}

  /** Templates, presets, formats and safe provider metadata. */
  @Get("images/templates")
  capabilities() {
    return this.images.getCapabilities()
  }

  /** Generate only an AI background. Useful for iterating on artwork. */
  @Post("cases/:caseId/images/generate-background")
  generateBackground(
    @Param("caseId", new ParseUUIDPipe()) caseId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: GenerateBackgroundDto,
  ) {
    return this.images.generateBackground(caseId, user.id, dto)
  }

  /** Render a poster over an existing background with a chosen template. */
  @Post("cases/:caseId/images/render")
  renderPoster(
    @Param("caseId", new ParseUUIDPipe()) caseId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RenderPosterDto,
  ) {
    return this.images.renderPoster(caseId, user.id, dto)
  }

  /** One-shot pipeline: AI background + SVG typography + final export. */
  @Post("cases/:caseId/images/generate")
  generatePoster(
    @Param("caseId", new ParseUUIDPipe()) caseId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: GeneratePosterDto,
  ) {
    return this.images.generatePoster(caseId, user.id, dto)
  }

  @Get("cases/:caseId/images")
  list(
    @Param("caseId", new ParseUUIDPipe()) caseId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.images.list(caseId, user.id)
  }

  @Get("cases/:caseId/images/:imageId")
  get(
    @Param("caseId", new ParseUUIDPipe()) caseId: string,
    @Param("imageId", new ParseUUIDPipe()) imageId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.images.get(caseId, user.id, imageId)
  }

  /** Authenticated inline preview (background or final poster). */
  @Get("cases/:caseId/images/:imageId/file")
  async file(
    @Param("caseId", new ParseUUIDPipe()) caseId: string,
    @Param("imageId", new ParseUUIDPipe()) imageId: string,
    @CurrentUser() user: AuthUser,
    @Query() query: ImageFileQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.images.readImageFile(
      caseId,
      user.id,
      imageId,
      query.kind ?? "final",
    )
    res.setHeader("Content-Type", file.contentType)
    res.setHeader("Content-Length", String(file.buffer.length))
    res.setHeader("Content-Disposition", `inline; filename="${file.fileName}"`)
    res.setHeader("Cache-Control", "private, max-age=60")
    res.send(file.buffer)
  }

  /** Authenticated attachment download. */
  @Get("cases/:caseId/images/:imageId/download")
  async download(
    @Param("caseId", new ParseUUIDPipe()) caseId: string,
    @Param("imageId", new ParseUUIDPipe()) imageId: string,
    @CurrentUser() user: AuthUser,
    @Query() query: ImageFileQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.images.readImageFile(
      caseId,
      user.id,
      imageId,
      query.kind ?? "final",
    )
    res.setHeader("Content-Type", file.contentType)
    res.setHeader("Content-Length", String(file.buffer.length))
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.fileName}"`,
    )
    res.setHeader("Cache-Control", "private, no-store")
    res.send(file.buffer)
  }
}
