import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { PrismaService } from "../prisma/prisma.service"
import { ProfileEncryptionService } from "./profile.encryption"
import type {
  AccountType,
  Gender,
  PreferredLanguage,
  ProfileDto,
  QuickOnboardDto,
  SathiContextDto,
  UpdateProfileDto,
} from "./profile.dto"
import type { AppEnv } from "../config/env.schema"

const ACCOUNT_FIELDS_NOT_NCRP = [
  "gstNumber",
  "companyName",
  "authorizedSignatoryName",
  "notificationSms",
  "notificationEmail",
]

function emptyProfile(id: string): ProfileDto {
  return {
    id,
    onboardingCompleted: false,
    notificationSms: false,
    notificationEmail: false,
  }
}

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: ProfileEncryptionService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  private async lookUpPincodeInternal(pin: string): Promise<{
    city?: string | null
    district?: string | null
    state?: string | null
  }> {
    try {
      const response = await fetch(
        `https://api.postalpincode.in/pincode/${encodeURIComponent(pin)}`,
        { signal: AbortSignal.timeout(8_000) },
      )
      if (!response.ok) return {}
      const payload = (await response.json()) as Array<{
        Status: string
        PostOffice: Array<{
          Name: string
          District: string
          State: string
          Division: string
        }>
      }>
      const postOffice = payload?.[0]?.PostOffice?.[0]
      if (!postOffice) return {}
      return {
        city: postOffice.District ?? null,
        district: postOffice.District ?? null,
        state: postOffice.State ?? null,
      }
    } catch (error) {
      this.logger.warn(
        `PIN code lookup failed for ${pin}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return {}
    }
  }

  async getProfile(userId: string): Promise<ProfileDto> {
    // `userId` is the Supabase auth uuid (== `profiles.id` / `users.id` column).
    const [profile, user] = await Promise.all([
      this.prisma.profile.findUnique({ where: { id: userId } }),
      this.prisma.user.findUnique({ where: { supabaseId: userId } }),
    ])

    if (!profile && !user) {
      throw new NotFoundException("User profile not found")
    }

    const decryptedAadhaar = this.encryption.decrypt(profile?.aadhaarLast4 ?? null)
    const decryptedAccount = this.encryption.decrypt(
      profile?.accountNumberLast4 ?? null,
    )

    return {
      id: userId,
      username: profile?.username ?? null,
      avatarUrl: profile?.avatarUrl ?? null,
      bio: profile?.bio ?? null,

      fullName: profile?.fullName ?? user?.displayName ?? null,
      dateOfBirth: profile?.dateOfBirth ?? null,
      gender: profile?.gender ?? null,

      mobile: profile?.mobile ?? user?.phoneE164 ?? null,
      email: profile?.email ?? user?.email ?? null,

      addressLine1: profile?.addressLine1 ?? null,
      city: profile?.city ?? null,
      district: profile?.district ?? user?.district ?? null,
      state: profile?.state ?? user?.state ?? null,
      pinCode: profile?.pinCode ?? null,

      aadhaarLast4: this.encryption.mask(decryptedAadhaar),
      pan: profile?.pan ?? null,

      bankName: profile?.bankName ?? null,
      accountNumberLast4: this.encryption.mask(decryptedAccount),
      ifscCode: profile?.ifscCode ?? null,
      upiId: profile?.upiId ?? null,

      accountType: profile?.accountType ?? null,
      preferredLanguage:
        profile?.preferredLanguage ?? user?.preferredLanguage ?? null,
      notificationSms: profile?.notificationSms ?? false,
      notificationEmail: profile?.notificationEmail ?? false,

      gstNumber: profile?.gstNumber ?? null,
      companyName: profile?.companyName ?? null,
      authorizedSignatoryName: profile?.authorizedSignatoryName ?? null,

      onboardingCompleted: profile?.onboardingCompleted ?? false,
    }
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<ProfileDto> {
    const existing = await this.prisma.profile.findUnique({
      where: { id: userId },
    })

    if (!existing) {
      await this.prisma.profile.create({
        data: { id: userId },
      })
    }

    const encryptedAadhaar = this.encryption.encrypt(dto.aadhaarLast4 ?? null)
    const encryptedAccount = this.encryption.encrypt(
      dto.accountNumberLast4 ?? null,
    )

    const profileData: Record<string, unknown> = {}
    if (dto.fullName !== undefined) profileData.fullName = dto.fullName
    if (dto.dateOfBirth !== undefined) profileData.dateOfBirth = dto.dateOfBirth
    if (dto.gender !== undefined) profileData.gender = dto.gender
    if (dto.mobile !== undefined) profileData.mobile = dto.mobile
    if (dto.email !== undefined) profileData.email = dto.email
    if (dto.addressLine1 !== undefined)
      profileData.addressLine1 = dto.addressLine1
    if (dto.city !== undefined) profileData.city = dto.city
    if (dto.district !== undefined) profileData.district = dto.district
    if (dto.state !== undefined) profileData.state = dto.state
    if (dto.pinCode !== undefined) profileData.pinCode = dto.pinCode
    if (encryptedAadhaar !== null) profileData.aadhaarLast4 = encryptedAadhaar
    if (dto.pan !== undefined) profileData.pan = dto.pan
    if (dto.bankName !== undefined) profileData.bankName = dto.bankName
    if (encryptedAccount !== null)
      profileData.accountNumberLast4 = encryptedAccount
    if (dto.ifscCode !== undefined) profileData.ifscCode = dto.ifscCode
    if (dto.upiId !== undefined) profileData.upiId = dto.upiId
    if (dto.accountType !== undefined) profileData.accountType = dto.accountType
    if (dto.preferredLanguage !== undefined)
      profileData.preferredLanguage = dto.preferredLanguage
    if (dto.notificationSms !== undefined)
      profileData.notificationSms = dto.notificationSms
    if (dto.notificationEmail !== undefined)
      profileData.notificationEmail = dto.notificationEmail
    if (dto.gstNumber !== undefined) profileData.gstNumber = dto.gstNumber
    if (dto.companyName !== undefined) profileData.companyName = dto.companyName
    if (dto.authorizedSignatoryName !== undefined)
      profileData.authorizedSignatoryName = dto.authorizedSignatoryName

    await this.prisma.profile.upsert({
      where: { id: userId },
      update: profileData,
      create: { id: userId, ...profileData },
    })

    // Keep the `users` auth row in sync for fields used across the app.
    const userUpdates: Record<string, unknown> = {}
    if (dto.fullName !== undefined)
      userUpdates.displayName = dto.fullName
    if (dto.mobile !== undefined)
      userUpdates.phoneE164 = dto.mobile
    if (dto.email !== undefined) userUpdates.email = dto.email
    if (dto.state !== undefined) userUpdates.state = dto.state
    if (dto.district !== undefined) userUpdates.district = dto.district
    if (dto.preferredLanguage !== undefined)
      userUpdates.preferredLanguage = dto.preferredLanguage

    if (Object.keys(userUpdates).length > 0) {
      await this.prisma.user.update({
        where: { supabaseId: userId },
        data: userUpdates,
      })
    }

    return this.getProfile(userId)
  }

  async quickOnboard(
    userId: string,
    dto: QuickOnboardDto,
  ): Promise<ProfileDto & { derived: { city?: string; district?: string; state?: string } }> {
    const derived = await this.lookUpPincodeInternal(dto.pinCode)

    await this.prisma.profile.upsert({
      where: { id: userId },
      update: {
        fullName: dto.fullName,
        addressLine1: dto.addressLine1,
        pinCode: dto.pinCode,
        ...(derived.city ? { city: derived.city } : {}),
        ...(derived.district ? { district: derived.district } : {}),
        ...(derived.state ? { state: derived.state } : {}),
        onboardingCompleted: true,
      },
      create: {
        id: userId,
        fullName: dto.fullName,
        addressLine1: dto.addressLine1,
        pinCode: dto.pinCode,
        city: derived.city ?? null,
        district: derived.district ?? null,
        state: derived.state ?? null,
        onboardingCompleted: true,
      },
    })

    // Mirror name/email/location onto the users auth row.
    const userUpdates: Record<string, unknown> = {
      displayName: dto.fullName,
      onboardingCompleted: true,
      onboardingStep: "completed",
    }
    if (dto.email) userUpdates.email = dto.email
    if (derived.state) userUpdates.state = derived.state
    if (derived.district) userUpdates.district = derived.district
    await this.prisma.user.update({ where: { supabaseId: userId }, data: userUpdates })

    const profile = await this.getProfile(userId)
    return { ...profile, derived }
  }

  async lookUpPincode(pin: string) {
    return this.lookUpPincodeInternal(pin)
  }

  async getSathiContext(userId: string): Promise<SathiContextDto> {
    const profile = await this.getProfile(userId)

    const hints: string[] = []
    if (profile.fullName) {
      hints.push(`Greets the user by name: ${profile.fullName}. Do not ask for their name.`)
    }
    if (profile.mobile) {
      hints.push(`Confirms the number on file: ${profile.mobile}. Do not ask for their mobile number again.`)
    }
    if (profile.city && profile.district) {
      hints.push(`Already knows the user's jurisdiction: ${profile.city}, ${profile.district}, ${profile.state}. Do not ask jurisdiction questions.`)
    }
    if (profile.bankName && profile.accountNumberLast4) {
      hints.push(`Already knows refund/bank details: ${profile.bankName}, account ending ${profile.accountNumberLast4}. Do not ask for refund details.`)
    }
    if (!profile.aadhaarLast4) {
      hints.push("Aadhaar last-4 is missing; ask for it during the call (needed for NCRP filing).")
    }

    const contextBits: string[] = []
    if (profile.fullName) contextBits.push(`Full name: ${profile.fullName}`)
    if (profile.mobile) contextBits.push(`Mobile: ${profile.mobile}`)
    if (profile.email) contextBits.push(`Email: ${profile.email}`)
    if (profile.city || profile.district || profile.state)
      contextBits.push(`Address: ${profile.addressLine1 ?? ""}, ${profile.city ?? ""}, ${profile.district ?? ""}, ${profile.state ?? ""}, ${profile.pinCode ?? ""}`.trim())
    if (profile.aadhaarLast4) contextBits.push(`Aadhaar last-4: ${profile.aadhaarLast4}`)
    if (profile.bankName || profile.accountNumberLast4 || profile.ifscCode || profile.upiId)
      contextBits.push(`Bank: ${profile.bankName ?? ""}, account ${profile.accountNumberLast4 ?? ""}, IFSC ${profile.ifscCode ?? ""}, UPI ${profile.upiId ?? ""}`)

    return {
      fullName: profile.fullName,
      mobile: profile.mobile,
      email: profile.email,
      addressLine1: profile.addressLine1,
      city: profile.city,
      district: profile.district,
      state: profile.state,
      pinCode: profile.pinCode,
      bankName: profile.bankName,
      accountNumberLast4: profile.accountNumberLast4,
      ifscCode: profile.ifscCode,
      upiId: profile.upiId,
      aadhaarLast4: profile.aadhaarLast4,
      preferredLanguage: profile.preferredLanguage,
      accountType: profile.accountType,
      onboardingCompleted: profile.onboardingCompleted,
      greetingHint: hints.length > 0 ? hints.join(" ") : "No profile context available; proceed with standard intake.",
      systemPromptContext: contextBits.length > 0
        ? `USER PROFILE CONTEXT:\n${contextBits.join("\n")}`
        : "USER PROFILE CONTEXT: (none available)",
    }
  }
}
