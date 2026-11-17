import { Module } from "@nestjs/common"
import { CloudflareImagesClient } from "./cloudflare-images.client"
import { CompositionEngineService } from "./composition-engine.service"
import { GeneratedImageStorage } from "./image-storage.service"
import { ImagesConfigService } from "./images.config"
import { ImagesController } from "./images.controller"
import { ImagesService } from "./images.service"

/**
 * AI image generation and composition pipeline:
 * Cloudflare Workers AI (Flux Schnell) -> decode/validate -> ImageMagick
 * composition with SVG typography -> project storage -> download API.
 */
@Module({
  controllers: [ImagesController],
  providers: [
    ImagesConfigService,
    CloudflareImagesClient,
    GeneratedImageStorage,
    CompositionEngineService,
    ImagesService,
  ],
  exports: [ImagesService, ImagesConfigService, CloudflareImagesClient],
})
export class ImagesModule {}
