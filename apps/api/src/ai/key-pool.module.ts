import { Global, Module } from "@nestjs/common"
import { KeyPool } from "./key-pool";
import { AiGateway } from "./ai-gateway.service"

@Global()
@Module({
  providers: [KeyPool, AiGateway],
  exports: [KeyPool, AiGateway],
})
export class KeyPoolModule {}
