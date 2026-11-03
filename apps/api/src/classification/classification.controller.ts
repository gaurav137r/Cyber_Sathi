import { Body, Controller, Param, Post, Req, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger"
import { AuthUser } from "../auth/auth.service"
import { CurrentUser } from "../auth/current-user.decorator"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { ClassificationOrchestrator } from "./classification.service"

@Controller("cases")
@UseGuards(JwtAuthGuard)
@ApiTags("classification")
@ApiBearerAuth()
export class ClassificationController {
  constructor(private readonly classification: ClassificationOrchestrator) {}

  @Post(":id/classify")
  @ApiOperation({
    summary: "Classify a case transcript with strict structured output",
  })
  classify(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
    @Req() request: { requestId?: string },
  ) {
    return this.classification.classify(id, user, request.requestId)
  }

  @Post(":id/clarification/complete")
  @ApiOperation({
    summary:
      "Confirm a concrete category after a low-confidence classification",
  })
  completeClarification(
    @Param("id") id: string,
    @Body("category") category: string,
    @CurrentUser() user: AuthUser,
    @Req() request: { requestId?: string },
  ) {
    return this.classification.completeClarification(
      id,
      user,
      category,
      request.requestId,
    )
  }
}
