import { Controller, Get, HttpCode, HttpStatus, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { HealthService } from "./health.service";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Dependency health (Postgres, Redis, MinIO)" })
  async get(@Res({ passthrough: true }) res: Response) {
    const body = await this.health.check();
    if (body.status !== "ok") {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return body;
  }
}
