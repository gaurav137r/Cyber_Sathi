import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"

import { IsArray, IsIn, IsOptional, IsString, MaxLength } from "class-validator"

import { deviceContextSources } from "./sathi.types"

export class StartSathiSessionDto {
  @ApiPropertyOptional({ example: "hi" })

  @IsOptional()

  @IsString()
  language?: string

  @ApiPropertyOptional({ enum: ["bland", "gemini"], default: "gemini" })

  @IsOptional()

  @IsIn(["bland", "gemini"])
  provider?: "bland" | "gemini"
}

export class SathiTurnQueryDto {
  @ApiPropertyOptional({ example: "hi" })

  @IsOptional()

  @IsString()
  language?: string

  @ApiPropertyOptional({
    example: "Someone called and asked me to scan a QR code.",
  })

  @IsOptional()

  @IsString()

  @MaxLength(8000)
  text?: string
}

/** A display transcript emitted by the live voice provider. */
export class SathiTranscriptDto {
  @ApiProperty({ enum: ["user", "model"], example: "user" })
  @IsIn(["user", "model"])
  role: "user" | "model"

  @ApiProperty({ example: "I sent money through UPI." })
  @IsString()
  @MaxLength(8000)
  text: string
}

export class DeviceContextDto {
  @ApiProperty({ enum: deviceContextSources, example: "CALL" })

  @IsIn(deviceContextSources)
  source: typeof deviceContextSources[number]

  @ApiProperty({ example: "+919876500021" })

  @IsString()

  @MaxLength(32)
  phone: string

  @ApiPropertyOptional({ example: "Unknown caller" })

  @IsOptional()

  @IsString()

  @MaxLength(120)
  label?: string

  @ApiPropertyOptional({ example: ["+919876500021", "+912266487777"] })

  @IsOptional()

  @IsArray()

  @IsString({ each: true })
  candidates?: string[]
}

export class SathiSpeechDto {
  @ApiProperty({
    example: "I’m sorry this happened. When did you first notice it?",
  })
  @IsString()
  @MaxLength(2000)
  text: string

  @ApiPropertyOptional({ example: "hi" })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  language?: string
}

export class CreateSocialPostDto {
  @ApiProperty({ enum: ["warning", "informational"] })
  @IsIn(["warning", "informational"])
  tone: "warning" | "informational"

  @ApiProperty({ enum: ["twitter", "instagram", "whatsapp"] })
  @IsIn(["twitter", "instagram", "whatsapp"])
  platform: "twitter" | "instagram" | "whatsapp"
}
