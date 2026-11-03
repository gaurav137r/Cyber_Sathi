import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { PrismaService } from "../infra/prisma.service"
import { CompleteProfileDto, UpdateOnboardingDto } from "./auth.dto"

export interface AuthUser {
  id: string
  supabaseId: string
  email: string | null
  phoneE164: string | null
  displayName: string | null
  preferredLanguage: string
  state: string | null
  district: string | null
  onboardingCompleted: boolean
  onboardingStep: string | null
}

type SupabaseUser = {
  id: string
  email?: string
  phone?: string
  user_metadata?: {
    display_name?: unknown
    full_name?: unknown
    preferredLanguage?: unknown
    state?: unknown
    district?: unknown
  }
}

type SupabaseSession = {
  access_token: string
  refresh_token: string
  expires_in: number
  user: SupabaseUser
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async requestOtp(rawPhone: string): Promise<{ accepted: true }> {
    const phoneE164 = this.normalizePhone(rawPhone)
    await this.supabaseRequest("/auth/v1/otp", {
      phone: phoneE164,
      create_user: true,
    })
    return { accepted: true }
  }

  async verifyOtp(rawPhone: string, otp: string) {
    const phoneE164 = this.normalizePhone(rawPhone)
    if (!/^\d{6}$/.test(otp))
      throw new BadRequestException("OTP must contain exactly 6 digits")
    const session = await this.supabaseRequest<SupabaseSession>(
      "/auth/v1/verify",
      {
        phone: phoneE164,
        token: otp,
        type: "sms",
      },
      "POST",
      true,
    )
    const profile = await this.saveSupabaseUser(session.user)
    return this.sessionResult(session, profile)
  }

  async requestEmailOtp(email: string): Promise<{ accepted: true }> {
    const cleanEmail = email.trim().toLowerCase()
    await this.supabaseRequest("/auth/v1/otp", {
      email: cleanEmail,
      create_user: true,
    })
    return { accepted: true }
  }

  async verifyEmailOtp(email: string, otp: string) {
    const cleanEmail = email.trim().toLowerCase()
    if (!/^\d{6}$/.test(otp))
      throw new BadRequestException("OTP must contain exactly 6 digits")
    const session = await this.supabaseRequest<SupabaseSession>(
      "/auth/v1/verify",
      {
        email: cleanEmail,
        token: otp,
        type: "email",
      },
      "POST",
      true,
    )
    const profile = await this.saveSupabaseUser(session.user)
    return this.sessionResult(session, profile)
  }

  async loginWithPassword(email: string, password: string) {
    const cleanEmail = email.trim().toLowerCase()
    const session = await this.supabaseRequest<SupabaseSession>(
      "/auth/v1/token?grant_type=password",
      {
        email: cleanEmail,
        password,
      },
      "POST",
      true,
    )
    const profile = await this.saveSupabaseUser(session.user)
    return this.sessionResult(session, profile)
  }

  async refresh(refreshToken: string) {
    if (!refreshToken?.trim())
      throw new BadRequestException("A refresh token is required")
    const session = await this.supabaseRequest<SupabaseSession>(
      "/auth/v1/token?grant_type=refresh_token",
      {
        refresh_token: refreshToken,
      },
      "POST",
      true,
    )
    const profile = await this.saveSupabaseUser(session.user)
    return this.sessionResult(session, profile)
  }

  async logout(accessToken: string): Promise<void> {
    await this.supabaseRequest(
      "/auth/v1/logout",
      undefined,
      "POST",
      true,
      accessToken,
    )
  }

  async authenticateAccessToken(accessToken: string): Promise<AuthUser> {
    if (!accessToken)
      throw new UnauthorizedException("A bearer token is required")
    const user = await this.supabaseRequest<SupabaseUser>(
      "/auth/v1/user",
      undefined,
      "GET",
      true,
      accessToken,
    )
    return this.saveSupabaseUser(user)
  }

  async getProfile(user: AuthUser): Promise<AuthUser> {
    const profile = await this.prisma.user.findUnique({
      where: { id: user.id },
    })
    if (!profile) throw new NotFoundException("User profile not found")
    return this.toAuthUser(profile, user.supabaseId)
  }

  async updateOnboarding(
    user: AuthUser,
    dto: UpdateOnboardingDto,
  ): Promise<AuthUser> {
    const profile = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        ...(dto.preferredLanguage
          ? { preferredLanguage: dto.preferredLanguage }
          : {}),
        ...(dto.onboardingStep ? { onboardingStep: dto.onboardingStep } : {}),
        ...(dto.state ? { state: dto.state } : {}),
        ...(dto.district ? { district: dto.district } : {}),
      },
    })
    return this.toAuthUser(profile, user.supabaseId)
  }

  async completeProfile(
    user: AuthUser,
    dto: CompleteProfileDto,
  ): Promise<AuthUser> {
    const displayName = dto.displayName.trim()
    if (displayName.length < 2 || displayName.length > 100) {
      throw new BadRequestException("Name must be between 2 and 100 characters")
    }
    const phoneE164 = dto.phone ? this.normalizePhone(dto.phone) : undefined

    const profile = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        displayName,
        ...(phoneE164 ? { phoneE164 } : {}),
        ...(dto.preferredLanguage
          ? { preferredLanguage: dto.preferredLanguage }
          : {}),
        ...(dto.state ? { state: dto.state } : {}),
        ...(dto.district ? { district: dto.district } : {}),
        onboardingCompleted: true,
        onboardingStep: "completed",
      },
    })
    return this.toAuthUser(profile, user.supabaseId)
  }

  normalizePhone(rawPhone: string): string {
    if (typeof rawPhone !== "string")
      throw new BadRequestException("A phone number is required")
    const compact = rawPhone.replace(/[\s()-]/g, "")
    const phoneE164 = compact.startsWith("+") ? compact : `+91${compact}`
    if (!/^\+91[6-9]\d{9}$/.test(phoneE164))
      throw new BadRequestException("Use a valid Indian phone number")
    return phoneE164
  }

  private async saveSupabaseUser(user: SupabaseUser): Promise<AuthUser> {
    if (!user.id)
      throw new UnauthorizedException(
        "Supabase returned an invalid user record",
      )
    const phoneE164 = user.phone ? this.normalizePhone(user.phone) : null
    const email = user.email ? user.email.toLowerCase().trim() : null
    const metaName = (user.user_metadata?.full_name ||
      user.user_metadata?.display_name) as string | undefined

    let existing = await this.prisma.user.findUnique({
      where: { supabaseId: user.id },
    })
    if (!existing && phoneE164) {
      existing = await this.prisma.user.findUnique({ where: { phoneE164 } })
    }
    if (!existing && email) {
      existing = await this.prisma.user.findUnique({ where: { email } })
    }

    const profile = existing
      ? await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            supabaseId: user.id,
            ...(phoneE164 ? { phoneE164 } : {}),
            ...(email ? { email } : {}),
            ...(metaName && !existing.displayName
              ? { displayName: metaName }
              : {}),
          },
        })
      : await this.prisma.user.create({
          data: {
            supabaseId: user.id,
            phoneE164,
            email,
            displayName: metaName ?? null,
            onboardingCompleted: false,
            onboardingStep: "language",
          },
        })

    return this.toAuthUser(profile, user.id)
  }

  private toAuthUser(
    profile: {
      id: string
      supabaseId: string | null
      email: string | null
      phoneE164: string | null
      displayName: string | null
      preferredLanguage: string
      state: string | null
      district: string | null
      onboardingCompleted: boolean
      onboardingStep: string | null
    },
    supabaseId: string,
  ): AuthUser {
    return {
      id: profile.id,
      supabaseId: profile.supabaseId ?? supabaseId,
      email: profile.email,
      phoneE164: profile.phoneE164,
      displayName: profile.displayName,
      preferredLanguage: profile.preferredLanguage,
      state: profile.state,
      district: profile.district,
      onboardingCompleted: profile.onboardingCompleted,
      onboardingStep: profile.onboardingStep,
    }
  }

  private sessionResult(session: SupabaseSession, profile: AuthUser) {
    return {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      tokenType: "Bearer",
      expiresIn: session.expires_in,
      profile,
    }
  }

  private async supabaseRequest<T = unknown,>(
    path: string,
    body?: unknown,
    method = "POST",
    invalidSession = false,
    accessToken?: string,
  ): Promise<T> {
    const baseUrl = this.config
      .getOrThrow<string>("SUPABASE_URL")
      .replace(/\/+$/, "")
    const apiKey =
      this.config.get<string>("SUPABASE_PUBLISHABLE_KEY") ??
      this.config.getOrThrow<string>("SUPABASE_ANON_KEY")
    let response: Response
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${accessToken ?? apiKey}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
    } catch {
      throw new BadGatewayException("Could not connect to Supabase Auth")
    }
    if (!response.ok) {
      if (
        invalidSession &&
        (response.status === 400 ||
          response.status === 401 ||
          response.status === 403)
      ) {
        throw new UnauthorizedException("Invalid or expired Supabase session")
      }
      const errBody = (await response.json().catch(() => ({}))) as {
        msg?: string
        error_description?: string
        message?: string
      }
      const message =
        errBody.msg ||
        errBody.error_description ||
        errBody.message ||
        "Supabase Auth rejected the request"
      throw new BadRequestException(message)
    }
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }
}
