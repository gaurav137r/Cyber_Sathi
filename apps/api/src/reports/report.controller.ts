import { Controller, Param, Post, Req, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger"
import { AuthUser } from "../auth/auth.service"
import { CurrentUser } from "../auth/current-user.decorator"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { ReportCompilerService } from "./report-compiler.service"

@Controller("cases")
@UseGuards(JwtAuthGuard)
@ApiTags("reports")
@ApiBearerAuth()
export class ReportController {
  constructor(private readonly compiler: ReportCompilerService) {}

  @Post(":id/compile-report")
  @ApiOperation({
    summary: "Compile an internal, provenance-tagged report version",
  })
  compile(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
    @Req() request: { requestId?: string },
  ) {
    return this.compiler.compile(id, user, request.requestId)
  }
}
