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
import { CaseService } from "./case.service"
import { CreateCaseDto, TransitionCaseDto, UpdateCaseDto } from "./case.dto"
import { CurrentUser } from "../auth/current-user.decorator"
import { AuthUser } from "../auth/auth.service"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"

@Controller("cases")
@UseGuards(JwtAuthGuard)
@ApiTags("cases")
@ApiBearerAuth()
export class CaseController {
  constructor(private readonly cases: CaseService) {}

  @Post()
  @ApiOperation({ summary: "Create a draft case" })
  create(
    @Body() body: CreateCaseDto,
    @CurrentUser() user: AuthUser,
    @Req() request: { requestId?: string },
  ) {
    return this.cases.create(body, user, request.requestId)
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update case details and user corrections" })
  update(
    @Param("id") id: string,
    @Body() body: UpdateCaseDto,
    @CurrentUser() user: AuthUser,
    @Req() request: { requestId?: string },
  ) {
    return this.cases.update(id, body, user, request.requestId)
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.cases.findAll(user.id)
  }

  @Get(":id")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.cases.findOne(id, user.id)
  }

  @Post(":id/transition")
  @ApiOperation({
    summary: "Move a case through its explicit lifecycle state machine",
  })
  transition(
    @Param("id") id: string,
    @Body() body: TransitionCaseDto,
    @CurrentUser() user: AuthUser,
    @Req() request: { requestId?: string },
  ) {
    return this.cases.transition(id, body, user, request.requestId)
  }
}
