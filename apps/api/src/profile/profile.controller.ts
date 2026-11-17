import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { CurrentUser } from "../auth/current-user.decorator"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { AuthUser } from "../auth/auth.service"
import { ProfileService } from "./profile.service"
import {
  QuickOnboardDto,
  UpdateProfileDto,
} from "./profile.dto"

@Controller("profile")
@UseGuards(JwtAuthGuard)
@ApiTags("profile")
@ApiBearerAuth()
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  /** Current user's full profile (sensitive identifiers masked). */
  @Get()
  getProfile(@CurrentUser() user: AuthUser) {
    return this.profile.getProfile(user.supabaseId ?? user.id)
  }

  /** Update any profile field. Sensitive identifiers are encrypted at rest. */
  @Patch()
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.profile.updateProfile(user.supabaseId ?? user.id, dto)
  }

  /** Quick onboarding: 4 fields, single screen, post-signup. */
  @Post("quick-onboard")
  quickOnboard(@CurrentUser() user: AuthUser, @Body() dto: QuickOnboardDto) {
    return this.profile.quickOnboard(user.supabaseId ?? user.id, dto)
  }

  /** Look up city/district/state for an Indian PIN code. */
  @Get("pincode")
  lookUpPincode(@Query("pin") pin: string) {
    if (!/^\d{6}$/.test(pin ?? "")) {
      throw new Error("PIN code must be 6 digits")
    }
    return this.profile.lookUpPincode(pin)
  }
}
