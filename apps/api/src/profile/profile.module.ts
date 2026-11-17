import { Module } from "@nestjs/common"
import { PrismaModule } from "../prisma/prisma.module"
import { ConfigModule } from "@nestjs/config"
import { ProfileController } from "./profile.controller"
import { ProfileService } from "./profile.service"
import { ProfileEncryptionService } from "./profile.encryption"

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [ProfileController],
  providers: [ProfileService, ProfileEncryptionService],
  exports: [ProfileService, ProfileEncryptionService],
})
export class ProfileModule {}
