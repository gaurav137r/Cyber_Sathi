import { Body, Controller, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsUUID } from "class-validator";
import type { Request } from "express";
import { JobsService } from "./jobs.service";

class PingJobDto {
  @IsUUID()
  caseId!: string;
}

@ApiTags("smoke")
@Controller("smoke/jobs")
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post("ping")
  @ApiOperation({ summary: "Enqueue a trivial BullMQ ping job that touches case.updatedAt" })
  enqueuePing(@Body() dto: PingJobDto, @Req() req: Request) {
    const requestId = String(req.id ?? "");
    return this.jobs.enqueuePing(dto.caseId, requestId);
  }
}
