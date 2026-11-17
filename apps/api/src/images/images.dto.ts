import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator"
import {
  IMAGE_FORMATS,
  IMAGE_PRESETS,
  IMAGE_TEMPLATES,
} from "./images.types"

const presetIds = IMAGE_PRESETS.map((preset) => preset.id)
const templateIds = IMAGE_TEMPLATES.map((template) => template.id)
const formatIds = IMAGE_FORMATS.map((format) => format.id)

class PromptFieldsDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  prompt?: string

  @IsOptional()
  @IsString()
  @MaxLength(320)
  subject?: string

  @IsOptional()
  @IsString()
  @MaxLength(240)
  campaignObjective?: string

  @IsOptional()
  @IsString()
  @MaxLength(240)
  visualStyle?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  palette?: string

  @IsOptional()
  @IsString()
  @MaxLength(280)
  composition?: string

  @IsOptional()
  @IsString()
  @MaxLength(60)
  aspectRatio?: string

  @IsOptional()
  @IsString()
  @MaxLength(220)
  backgroundRequirements?: string

  @IsOptional()
  @IsString()
  @MaxLength(300)
  negativeInstructions?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  outputPurpose?: string
}

class CanvasFieldsDto {
  @IsOptional()
  @IsIn(presetIds)
  preset?: string

  @IsOptional()
  @IsInt()
  @Min(256)
  @Max(4096)
  width?: number

  @IsOptional()
  @IsInt()
  @Min(256)
  @Max(4096)
  height?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  steps?: number

  @IsOptional()
  @IsBoolean()
  reuse?: boolean
}

class PosterTextFieldsDto {
  @IsOptional()
  @IsIn(templateIds)
  template?: string

  @IsOptional()
  @IsIn(formatIds)
  format?: string

  @IsOptional()
  @IsString()
  @MaxLength(180)
  headline?: string

  @IsOptional()
  @IsString()
  @MaxLength(260)
  subheadline?: string

  @IsOptional()
  @IsString()
  @MaxLength(900)
  body?: string

  @IsOptional()
  @IsString()
  @MaxLength(160)
  footer?: string

  @IsOptional()
  @IsString()
  @MaxLength(40)
  brandLabel?: string

  @IsOptional()
  @IsIn(["en", "hi"])
  language?: "en" | "hi"

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, {
    message: "accentColor must be a 6-digit hex colour such as #7FD1C0",
  })
  accentColor?: string
}

export class GenerateBackgroundDto extends PromptFieldsDto {
  @IsOptional()
  @IsIn(presetIds)
  preset?: string

  @IsOptional()
  @IsInt()
  @Min(256)
  @Max(4096)
  width?: number

  @IsOptional()
  @IsInt()
  @Min(256)
  @Max(4096)
  height?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  steps?: number

  @IsOptional()
  @IsBoolean()
  reuse?: boolean
}

export class RenderPosterDto extends PosterTextFieldsDto {
  @IsUUID()
  backgroundImageId: string

  @IsOptional()
  @IsIn(presetIds)
  preset?: string

  @IsOptional()
  @IsInt()
  @Min(256)
  @Max(4096)
  width?: number

  @IsOptional()
  @IsInt()
  @Min(256)
  @Max(4096)
  height?: number
}

export class ImageFileQueryDto {
  @IsOptional()
  @IsIn(["background", "final"])
  kind?: "background" | "final"
}

export class GeneratePosterDto extends PromptFieldsDto {
  @IsOptional()
  @IsIn(presetIds)
  preset?: string

  @IsOptional()
  @IsInt()
  @Min(256)
  @Max(4096)
  width?: number

  @IsOptional()
  @IsInt()
  @Min(256)
  @Max(4096)
  height?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  steps?: number

  @IsOptional()
  @IsBoolean()
  reuse?: boolean

  @IsOptional()
  @IsIn(templateIds)
  template?: string

  @IsOptional()
  @IsIn(formatIds)
  format?: string

  @IsOptional()
  @IsString()
  @MaxLength(180)
  headline?: string

  @IsOptional()
  @IsString()
  @MaxLength(260)
  subheadline?: string

  @IsOptional()
  @IsString()
  @MaxLength(900)
  body?: string

  @IsOptional()
  @IsString()
  @MaxLength(160)
  footer?: string

  @IsOptional()
  @IsString()
  @MaxLength(40)
  brandLabel?: string

  @IsOptional()
  @IsIn(["en", "hi"])
  language?: "en" | "hi"

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, {
    message: "accentColor must be a 6-digit hex colour such as #7FD1C0",
  })
  accentColor?: string
}
