import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common"
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger"
import { AuthUser } from "../auth/auth.service"
import { CurrentUser } from "../auth/current-user.decorator"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { ConfirmFilingInput, FilingService } from "./filing.service"

@Controller("cases")
@UseGuards(JwtAuthGuard)
@ApiTags("filing")
@ApiBearerAuth()
export class FilingController {
  constructor(private readonly filing: FilingService) {}

  @Get(":id/filing-preview")
  @ApiOperation({
    summary: "Return the exact data and checksum for manual portal review",
  })
  preview(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.filing.preview(id, user)
  }

  @Post(":id/confirm-filing")
  @ApiOperation({
    summary: "Confirm the reviewed preview and create a guided browser handoff",
  })
  confirm(
    @Param("id") id: string,
    @Body() body: ConfirmFilingInput,
    @CurrentUser() user: AuthUser,
    @Req() request: { requestId?: string },
  ) {
    return this.filing.confirm(id, body, user, request.requestId)
  }

  @Patch(":id/tracking-number")
  @ApiOperation({
    summary:
      "Record the acknowledgment received after manual portal submission",
  })
  recordTracking(
    @Param("id") id: string,
    @Body("trackingNumber") trackingNumber: string,
    @CurrentUser() user: AuthUser,
    @Req() request: { requestId?: string },
  ) {
    return this.filing.recordTracking(
      id,
      trackingNumber,
      user,
      request.requestId,
    )
  }
}
