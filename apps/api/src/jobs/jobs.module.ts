import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { CasesModule } from "../cases/cases.module";
import { CASE_JOBS_QUEUE } from "./job.constants";
import { JobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";
import { PingProcessor } from "./ping.processor";

@Module({
  imports: [CasesModule, BullModule.registerQueue({ name: CASE_JOBS_QUEUE })],
  controllers: [JobsController],
  providers: [JobsService, PingProcessor],
})
export class JobsModule {}
