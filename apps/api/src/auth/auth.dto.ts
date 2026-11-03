import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator"

export class RequestOtpDto {
  @IsString()
  @IsNotEmpty()
  phone: string
}

export class VerifyOtpDto {
  @IsString()
  @IsNotEmpty()
  phone: string

  @IsString()
  @Matches(/^\d{6}$/)
  otp: string
}

export class RequestEmailOtpDto {
  @IsEmail()
  @IsNotEmpty()
  email: string
}

export class VerifyEmailOtpDto {
  @IsEmail()
  @IsNotEmpty()
  email: string

  @IsString()
  @Matches(/^\d{6}$/)
  otp: string
}

export class LoginEmailPasswordDto {
  @IsEmail()
  @IsNotEmpty()
  email: string

  @IsString()
  @MinLength(6)
  password: string
}

export class CompleteProfileDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  displayName: string

  @IsString()
  @IsOptional()
  phone?: string

  @IsString()
  @IsOptional()
  preferredLanguage?: string

  @IsString()
  @IsOptional()
  state?: string

  @IsString()
  @IsOptional()
  district?: string
}

export class UpdateOnboardingDto {
  @IsString()
  @IsOptional()
  preferredLanguage?: string

  @IsString()
  @IsOptional()
  onboardingStep?: string

  @IsString()
  @IsOptional()
  state?: string

  @IsString()
  @IsOptional()
  district?: string
}

export class RefreshSessionDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string
}
