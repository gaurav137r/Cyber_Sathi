import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Sse,
  UseGuards,
} from "@nestjs/common"
import type { MessageEvent } from "@nestjs/common"
import type { Observable } from "rxjs"
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger"
import { AuthUser } from "../auth/auth.service"
import { CurrentUser } from "../auth/current-user.decorator"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import {
  ConfirmCaseReviewDto,
  RequestCaseEvidenceDto,
  RequestCaseInputDto,
  SubmitCaseRequestDto,
} from "./case-interactions.dto"
import { CaseInteractionsService } from "./case-interactions.service"

@Controller("cases/:id")
@UseGuards(JwtAuthGuard)
@ApiTags("case-interactions")
@ApiBearerAuth()
export class CaseInteractionsController {
  constructor(private readonly interactions: CaseInteractionsService) {}

  @Get("state")
  @ApiOperation({ summary: "Read compact, authenticated canonical case state" })
  getState(
    @Param("id", ParseUUIDPipe) caseId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.interactions.getState(caseId, user.id)
  }

  @Sse("events")
  @ApiOperation({ summary: "Stream persisted case events with bearer authentication" })
  events(
    @Param("id", ParseUUIDPipe) caseId: string,
    @Headers("last-event-id") lastEventId: string | undefined,
    @CurrentUser() user: AuthUser,
  ): Observable<MessageEvent> {
    return this.interactions.streamEvents(caseId, user.id, lastEventId)
  }

  @Post("requests/input")
  requestInput(
    @Param("id", ParseUUIDPipe) caseId: string,
    @Body() body: RequestCaseInputDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.interactions.requestField(
      caseId,
      user.id,
      body.field,
      body.displayPrompt,
    )
  }

  @Post("requests/evidence")
  requestEvidence(
    @Param("id", ParseUUIDPipe) caseId: string,
    @Body() body: RequestCaseEvidenceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.interactions.requestEvidence(caseId, user.id, body.category)
  }

  @Post("requests/review")
  requestReview(
    @Param("id", ParseUUIDPipe) caseId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.interactions.requestReview(caseId, user.id)
  }

  @Post("requests/:requestId/submit")
  submitRequest(
    @Param("id", ParseUUIDPipe) caseId: string,
    @Param("requestId") requestId: string,
    @Body() body: SubmitCaseRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.interactions.submitRequest(
      caseId,
      requestId,
      user.id,
      body.expectedRevision,
      body.value,
      body.omit ?? false,
    )
  }

  @Post("review/confirm")
  confirmReview(
    @Param("id", ParseUUIDPipe) caseId: string,
    @Body() body: ConfirmCaseReviewDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.interactions.confirmReview(caseId, user.id, body.expectedRevision)
  }

  @Post("needs-human")
  flagHumanSupport(
    @Param("id", ParseUUIDPipe) caseId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.interactions.flagHumanSupport(caseId, user.id)
  }
}
