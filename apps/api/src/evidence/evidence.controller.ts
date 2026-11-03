import {
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
import { EvidenceService } from "./evidence.service"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { CurrentUser } from "../auth/current-user.decorator"
import { AuthUser } from "../auth/auth.service"
import { EvidenceType } from "@prisma/client"

@Controller("evidence")
@UseGuards(JwtAuthGuard)
export class EvidenceController {
  constructor(private readonly evidence: EvidenceService) {}

  @Post()
  @UseInterceptors(FileInterceptor("file"))
  upload(
    @Query("caseId") caseId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file)
      throw new Error('A multipart file field named "file" is required')
    return this.evidence.upload(caseId, file, user)
  }

  @Get(":id/url")
  signedUrl(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.evidence.signedUrl(id, user)
  }
}

@Controller("cases")
@UseGuards(JwtAuthGuard)
export class CaseEvidenceController {
  constructor(private readonly evidence: EvidenceService) {}

  @Post(":id/evidence")
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 25 * 1024 * 1024 } }),
  )
  uploadCaseEvidence(
    @Param("id") id: string,
    @Query("type") type: EvidenceType | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file)
      throw new Error('A multipart file field named "file" is required')
    return this.evidence.upload(id, file, user, type)
  }
}
