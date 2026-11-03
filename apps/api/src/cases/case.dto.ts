import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"

export class StructuredFieldsDto {
  @ApiPropertyOptional({ example: "+919876543210" }) phone?: string
  @ApiPropertyOptional({ example: "2026-09-13T10:30:00Z" }) date?: string
  @ApiPropertyOptional({ example: 15000 }) amount?: number
  @ApiPropertyOptional({ example: "HDFC Bank" }) bankOrApp?: string
  @ApiPropertyOptional({ example: "Caller requested my UPI PIN." })
  description?: string
}

export class CreateCaseDto {
  @ApiPropertyOptional({ example: "upi-payment-fraud" }) category?: string
  @ApiPropertyOptional({ example: "hi" }) detectedLanguage?: string
  @ApiPropertyOptional({ example: "The caller claimed to be from my bank." })
  rawTranscript?: string
  @ApiPropertyOptional({ type: StructuredFieldsDto })
  structuredFields?: StructuredFieldsDto
}

export class UpdateCaseDto extends CreateCaseDto {
  @ApiPropertyOptional({ example: 0.94 }) categoryConfidence?: number
  @ApiPropertyOptional({ example: "National Cyber Crime Reporting Portal" })
  filingDestination?: string
  @ApiPropertyOptional({ example: "ACK-2026-981042" }) trackingNumber?: string
}

export class TransitionCaseDto {
  @ApiProperty({
    enum: [
      "PROCESSING",
      "CLASSIFIED",
      "REVIEWED",
      "FILED",
      "RESOLVED",
      "ARCHIVED",
    ],
  })
  status: string
  @ApiPropertyOptional({ example: "User confirmed the reviewed report." })
  reason?: string
}
