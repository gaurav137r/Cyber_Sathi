import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from "class-validator"

export const caseInputFields = [
  "victim_phone",
  "suspect_phone",
  "caller_name",
  "sms_content",
  "transaction_id",
  "amount",
  "currency",
  "incident_datetime",
  "bank_or_app",
  "provisional_fraud_category",
  "description",
] as const

export const evidenceCategories = [
  "payment_screenshot",
  "sms_screenshot",
  "call_recording",
  "document",
] as const

export class RequestCaseInputDto {
  @IsIn(caseInputFields)
  field: (typeof caseInputFields)[number]

  @IsOptional()
  @IsString()
  @MaxLength(160)
  displayPrompt?: string
}

export class RequestCaseEvidenceDto {
  @IsIn(evidenceCategories)
  category: (typeof evidenceCategories)[number]
}

export class SubmitCaseRequestDto {
  @IsString()
  @MaxLength(100)
  expectedRevision: string

  @IsOptional()
  @IsString()
  @MaxLength(30000)
  value?: string

  @IsOptional()
  @IsBoolean()
  omit?: boolean
}

export class ConfirmCaseReviewDto {
  @IsString()
  @MaxLength(100)
  expectedRevision: string
}
