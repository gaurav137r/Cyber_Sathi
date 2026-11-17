import { Module } from "@nestjs/common"
import { CaseModule } from "../cases/case.module"
import { JobsController } from "./jobs.controller"
import { JobsService } from "./jobs.service"
import { PingJobService } from "./ping-job.service"

@Module({
  imports: [CaseModule],
  controllers: [JobsController],
  providers: [JobsService, PingJobService],
})
export class JobsModule {}
