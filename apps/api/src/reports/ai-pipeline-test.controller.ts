import { Body, Controller, Post, UseGuards } from "@nestjs/common"
import { IsBoolean, IsIn, IsOptional, IsUUID } from "class-validator"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { CurrentUser } from "../auth/current-user.decorator"
import { AuthUser } from "../auth/auth.service"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { AiPipelineTask, AiPipelineTestService } from "./ai-pipeline-test.service"

class AiPipelineTestDto {
  @IsUUID()
  caseId: string

  @IsIn(["report", "summary", "post", "image"])
  task: AiPipelineTask

  @IsOptional()
  @IsBoolean()
  forceFallback?: boolean
}

@Controller("test")
@UseGuards(JwtAuthGuard)
@ApiTags("development")
@ApiBearerAuth()
export class AiPipelineTestController {
  constructor(private readonly pipeline: AiPipelineTestService) {}

  @Post("ai-pipeline")
  run(@Body() body: AiPipelineTestDto, @CurrentUser() user: AuthUser) {
    return this.pipeline.run(body, user.id)
  }
}
