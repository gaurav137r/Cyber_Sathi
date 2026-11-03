import { Module } from "@nestjs/common"

import { GeminiProvider } from "./gemini.provider"

import { SathiController } from "./sathi.controller"

import { SathiService } from "./sathi.service"

@Module({
  controllers: [SathiController],

  providers: [GeminiProvider, SathiService],
})
export class SathiModule {}
