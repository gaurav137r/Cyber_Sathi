import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"

export class VoiceIntakeQueryDto {
  @ApiPropertyOptional({ example: "hi" }) language?: string
}

export class SummaryAudioDto {
  @ApiProperty({
    example: "This report concerns a UPI payment fraud incident.",
  })
  text: string
  @ApiProperty({ example: "en" }) language: string
}
