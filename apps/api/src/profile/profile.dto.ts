import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator"

export enum AccountType {
  INDIVIDUAL = "individual",
  CORPORATE = "corporate",
  GOVT = "govt",
}

export enum Gender {
  MALE = "Male",
  FEMALE = "Female",
  OTHER = "Other",
  PREFER_NOT_TO_SAY = "Prefer not to say",
}

export enum PreferredLanguage {
  ENGLISH = "english",
  HINDI = "hindi",
  BILINGUAL = "bilingual",
}

/** Quick onboarding (4 fields, single screen, post-signup). */
export class QuickOnboardDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName: string

  @IsEmail()
  @IsOptional()
  email?: string

  @IsString()
  @MinLength(1)
  addressLine1: string

  @Matches(/^\d{6}$/)
  pinCode: string
}

/** Full profile update (user-editable, any time). */
export class UpdateProfileDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(100)
  fullName?: string

  @IsString()
  @IsOptional()
  dateOfBirth?: string

  @IsEnum(Gender)
  @IsOptional()
  gender?: Gender

  @IsPhoneNumber("IN")
  @IsOptional()
  mobile?: string

  @IsEmail()
  @IsOptional()
  email?: string

  @IsString()
  @IsOptional()
  addressLine1?: string

  @IsString()
  @IsOptional()
  city?: string

  @IsString()
  @IsOptional()
  district?: string

  @IsString()
  @IsOptional()
  state?: string

  @Matches(/^\d{6}$/)
  @IsOptional()
  pinCode?: string

  @IsString()
  @IsOptional()
  @MaxLength(20)
  aadhaarLast4?: string

  @IsString()
  @IsOptional()
  @MaxLength(20)
  pan?: string

  @IsString()
  @IsOptional()
  @MaxLength(100)
  bankName?: string

  @IsString()
  @IsOptional()
  @MaxLength(50)
  accountNumberLast4?: string

  @IsString()
  @IsOptional()
  @MaxLength(20)
  ifscCode?: string

  @IsString()
  @IsOptional()
  @MaxLength(100)
  upiId?: string

  @IsEnum(AccountType)
  @IsOptional()
  accountType?: AccountType

  @IsEnum(PreferredLanguage)
  @IsOptional()
  preferredLanguage?: PreferredLanguage

  @IsBoolean()
  @IsOptional()
  notificationSms?: boolean

  @IsBoolean()
  @IsOptional()
  notificationEmail?: boolean

  @IsString()
  @IsOptional()
  gstNumber?: string

  @IsString()
  @IsOptional()
  companyName?: string

  @IsString()
  @IsOptional()
  authorizedSignatoryName?: string
}

/** Safe output: sensitive identifiers are masked. */
export interface ProfileDto {
  id: string
  username?: string | null
  avatarUrl?: string | null
  bio?: string | null

  fullName?: string | null
  dateOfBirth?: string | null
  gender?: string | null

  mobile?: string | null
  email?: string | null

  addressLine1?: string | null
  city?: string | null
  district?: string | null
  state?: string | null
  pinCode?: string | null

  aadhaarLast4?: string | null        // masked ****1234
  pan?: string | null

  bankName?: string | null
  accountNumberLast4?: string | null  // masked ****1234
  ifscCode?: string | null
  upiId?: string | null

  accountType?: string | null
  preferredLanguage?: string | null
  notificationSms: boolean
  notificationEmail: boolean

  gstNumber?: string | null
  companyName?: string | null
  authorizedSignatoryName?: string | null

  onboardingCompleted: boolean
}

/** Voice-agent session context (injected as system prompt context). */
export interface SathiContextDto {
  fullName?: string | null
  mobile?: string | null
  email?: string | null
  addressLine1?: string | null
  city?: string | null
  district?: string | null
  state?: string | null
  pinCode?: string | null

  bankName?: string | null
  accountNumberLast4?: string | null  // masked
  ifscCode?: string | null
  upiId?: string | null

  aadhaarLast4?: string | null        // masked

  preferredLanguage?: string | null
  accountType?: string | null

  onboardingCompleted: boolean
  greetingHint?: string
  systemPromptContext?: string
}

/** PIN code lookup result from India Post API / static fallback. */
export interface PincodeLookupResult {
  pin: string
  status: string
  postoffice: Array<{
    name: string
    district: string
    state: string
    division: string
  }>
  city?: string | null
  district?: string | null
  state?: string | null
}
