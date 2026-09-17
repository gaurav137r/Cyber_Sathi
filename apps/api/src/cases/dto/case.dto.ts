import { CaseStatus, Prisma } from "@prisma/client";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

export class StructuredFieldsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankOrApp?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateCaseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rawTranscript?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  detectedLanguage?: string;

  @ApiPropertyOptional({ type: StructuredFieldsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StructuredFieldsDto)
  structuredFields?: StructuredFieldsDto;
}

export class UpdateCaseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rawTranscript?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  detectedLanguage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  categoryConfidence?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  filingDestination?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @ApiPropertyOptional({ type: StructuredFieldsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StructuredFieldsDto)
  structuredFields?: StructuredFieldsDto;
}

export class TransitionCaseDto {
  @ApiProperty({ enum: CaseStatus })
  @IsEnum(CaseStatus)
  toStatus!: CaseStatus;
}

export function asJson(
  value: StructuredFieldsDto | undefined,
): Prisma.InputJsonValue | undefined {
  if (!value) {
    return undefined;
  }
  return value as Prisma.InputJsonValue;
}
