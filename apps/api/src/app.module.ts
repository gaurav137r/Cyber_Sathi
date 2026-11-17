import { Module } from "@nestjs/common"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { LoggerModule } from "nestjs-pino"
import { randomUUID } from "node:crypto"
import { CaseModule } from "./cases/case.module"
import { AuthModule } from "./auth/auth.module"
import { EvidenceModule } from "./evidence/evidence.module"
import { SathiModule } from "./sathi/sathi.module"
import { VoiceModule } from "./voice/voice.module"
import type { AppEnv } from "./config/env.schema"
import { validateEnv } from "./config/env.schema"
import { HealthModule } from "./health/health.module"
import { PrismaModule } from "./prisma/prisma.module"
import { ReportsModule } from "./reports/reports.module"
import { ImagesModule } from "./images/images.module"
import { KeyPoolModule } from "./ai/key-pool.module"
import { SupabaseStorageModule } from "./storage/storage.module"
import { ProfileModule } from "./profile/profile.module"
import { BullModule } from "@nestjs/bullmq"

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: [".env.local", ".env", "../.env", ".env"],
      validate: validateEnv,
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnv, true>) => ({
        connection: {
          host: config.get("REDIS_HOST", { infer: true }),
          port: config.get("REDIS_PORT", { infer: true }),
        },
      }),
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === "production" ? "info" : "debug",
        redact: {
          paths: ["req.headers.authorization", "req.headers.cookie"],
          censor: "[REDACTED]",
        },
        genReqId: (req, res) => {
          const header = req.headers["x-request-id"]
          const id =
            typeof header === "string" && header.length > 0
              ? header
              : randomUUID()
          res.setHeader("x-request-id", id)
          return id
        },
        transport:
          process.env.NODE_ENV === "production"
            ? undefined
            : {
                target: "pino-pretty",
                options: { singleLine: true, colorize: true },
              },
        customProps: (req) => ({ requestId: req.id }),
      },
    }),
    PrismaModule,
    AuthModule,
    HealthModule,
    CaseModule,
    EvidenceModule,
    ReportsModule,
    ImagesModule,
    KeyPoolModule,
    SupabaseStorageModule,
    ProfileModule,
    SathiModule,
    VoiceModule,
  ],
})
export class AppModule {}
