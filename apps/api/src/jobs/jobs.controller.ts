import { Body, Controller, Post } from "@nestjs/common"
import { ApiOperation, ApiTags } from "@nestjs/swagger"
import { IsUUID } from "class-validator"
import { JobsService } from "./jobs.service"

class PingJobDto {
  @IsUUID()
  caseId: string
}

@ApiTags("smoke")
@Controller("smoke/jobs")
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post("ping")
  @ApiOperation({
    summary: "Enqueue a trivial job that touches case.updatedAt",
  })
  async enqueuePing(@Body() dto: PingJobDto) {
    const requestId = `${dto.caseId}` // simplified for local dev
    return this.jobs.enqueuePing(dto.caseId, requestId)
  }
}
