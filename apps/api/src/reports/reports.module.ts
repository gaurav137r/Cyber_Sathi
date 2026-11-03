import { Module } from "@nestjs/common"
import { ReportController } from "./report.controller"
import { ReportCompilerService } from "./report-compiler.service"

@Module({ controllers: [ReportController], providers: [ReportCompilerService] })
export class ReportsModule {}
