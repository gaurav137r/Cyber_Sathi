import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { randomUUID } from "node:crypto";
import { CasesModule } from "./cases/cases.module";
import type { AppEnv } from "./config/env.schema";
import { validateEnv } from "./config/env.schema";
import { HealthModule } from "./health/health.module";
import { JobsModule } from "./jobs/jobs.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { StorageModule } from "./storage/storage.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: [".env", "../../.env"],
      validate: validateEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === "production" ? "info" : "debug",
        genReqId: (req, res) => {
          const header = req.headers["x-request-id"];
          const id = typeof header === "string" && header.length > 0 ? header : randomUUID();
          res.setHeader("x-request-id", id);
          return id;
        },
        transport:
          process.env.NODE_ENV === "production"
            ? undefined
            : { target: "pino-pretty", options: { singleLine: true, colorize: true } },
        customProps: (req) => ({ requestId: req.id }),
      },
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnv, true>) => ({
        connection: {
          host: config.get("REDIS_HOST", { infer: true }),
          port: config.get("REDIS_PORT", { infer: true }),
        },
      }),
    }),
    PrismaModule,
    RedisModule,
    StorageModule,
    HealthModule,
    CasesModule,
    JobsModule,
  ],
})
export class AppModule {}
