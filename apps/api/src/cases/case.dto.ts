import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import { Type } from "class-transformer"
import {
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator"

export class StructuredFieldsDto {
  @ApiPropertyOptional({ example: "+919876543210" })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string

  @ApiPropertyOptional({ example: "+919876543210" })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  suspectPhone?: string

  @ApiPropertyOptional({ example: "+919876543210" })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  victimPhone?: string

  @ApiPropertyOptional({ example: "2026-09-13T10:30:00Z" })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  date?: string

  @ApiPropertyOptional({ example: "15000.00" })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  amount?: string

  @ApiPropertyOptional({ example: "INR" })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string

  @ApiPropertyOptional({ example: "HDFC Bank" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankOrApp?: string

  @ApiPropertyOptional({ example: "Caller requested my UPI PIN." })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  description?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  callerName?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  smsContent?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  transactionId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2200)
  suspectUpi?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2200)
  upiId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  suspectDetails?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  platform?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  summary?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  actionRequested?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  complainantName?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  complainantPhone?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(254)
  complainantEmail?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  complainantLocation?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  incidentDate?: string
}

export class CreateCaseDto {
  @ApiPropertyOptional({ example: "upi-payment-fraud" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string

  @ApiPropertyOptional({ example: "hi" })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  detectedLanguage?: string

  @ApiPropertyOptional({ example: "The caller claimed to be from my bank." })
  @IsOptional()
  @IsString()
  @MaxLength(30000)
  rawTranscript?: string

  @ApiPropertyOptional({ type: StructuredFieldsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StructuredFieldsDto)
  structuredFields?: StructuredFieldsDto
}

/**
 * Review-screen updates may contain any field that was extracted from the
 * conversation or added by a newer client. Keeping `structuredFields` as a
 * free-form object stops a new field (for example `upiId`) from being rejected
 * by the global whitelist before the user's edits can be saved.
 */
export class UpdateCaseDto {
  @ApiPropertyOptional({ example: "upi-payment-fraud" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string

  @ApiPropertyOptional({ example: "hi" })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  detectedLanguage?: string

  @ApiPropertyOptional({ example: "The caller claimed to be from my bank." })
  @IsOptional()
  @IsString()
  @MaxLength(30000)
  rawTranscript?: string

  @ApiPropertyOptional({
    type: "object",
    additionalProperties: true,
    description: "Reviewed case fields; arbitrary keys are accepted.",
  })
  @IsOptional()
  @IsObject()
  structuredFields?: Record<string, unknown>

  @ApiPropertyOptional({ description: "Revision returned by GET /cases/:id/state" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  expectedRevision?: string

  @ApiPropertyOptional({ example: 0.94 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  categoryConfidence?: number

  @ApiPropertyOptional({ example: "National Cyber Crime Reporting Portal" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  filingDestination?: string

  @ApiPropertyOptional({ example: "ACK-2026-981042" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  trackingNumber?: string
}

export class TransitionCaseDto {
  @ApiProperty({
    enum: ["PROCESSING", "CLASSIFIED", "REVIEWED", "FILED", "RESOLVED", "ARCHIVED"],
  })
  @IsIn(["PROCESSING", "CLASSIFIED", "REVIEWED", "FILED", "RESOLVED", "ARCHIVED"])
  status: string

  @ApiPropertyOptional({ example: "User confirmed the reviewed report." })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string
}
