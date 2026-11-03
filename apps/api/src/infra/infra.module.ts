import { Global, Module } from "@nestjs/common"
import { MinioService } from "./minio.service"
import { PrismaService } from "./prisma.service"
import { RedisService } from "./redis.service"

@Global()
@Module({
  providers: [PrismaService, RedisService, MinioService],
  exports: [PrismaService, RedisService, MinioService],
})
export class InfraModule {}
