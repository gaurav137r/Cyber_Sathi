import {
  Body,
  Controller,
  Get,
  Headers,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common"
import { CurrentUser } from "./current-user.decorator"
import { JwtAuthGuard } from "./jwt-auth.guard"
import { AuthService, AuthUser } from "./auth.service"
import {
  CompleteProfileDto,
  LoginEmailPasswordDto,
  RefreshSessionDto,
  RequestEmailOtpDto,
  RequestOtpDto,
  UpdateOnboardingDto,
  VerifyEmailOtpDto,
  VerifyOtpDto,
} from "./auth.dto"

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("otp/request")
  requestOtp(@Body() body: RequestOtpDto) {
    return this.auth.requestOtp(body.phone)
  }

  @Post("otp/verify")
  verifyOtp(@Body() body: VerifyOtpDto) {
    return this.auth.verifyOtp(body.phone, body.otp)
  }

  @Post("email/request")
  requestEmailOtp(@Body() body: RequestEmailOtpDto) {
    return this.auth.requestEmailOtp(body.email)
  }

  @Post("email/verify")
  verifyEmailOtp(@Body() body: VerifyEmailOtpDto) {
    return this.auth.verifyEmailOtp(body.email, body.otp)
  }

  @Post("login")
  loginWithPassword(@Body() body: LoginEmailPasswordDto) {
    return this.auth.loginWithPassword(body.email, body.password)
  }

  @Post("refresh")
  refresh(@Body() body: RefreshSessionDto) {
    return this.auth.refresh(body.refreshToken)
  }

  @Post("logout")
  @UseGuards(JwtAuthGuard)
  async logout(@Headers("authorization") authorization?: string) {
    const [scheme, accessToken] = authorization?.split(" ") ?? []
    if (scheme?.toLowerCase() !== "bearer" || !accessToken) {
      throw new UnauthorizedException("A bearer token is required")
    }
    await this.auth.logout(accessToken)
    return { loggedOut: true }
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  getCurrentUser(@CurrentUser() user: AuthUser) {
    return this.auth.getProfile(user)
  }

  @Get("profile")
  @UseGuards(JwtAuthGuard)
  getProfile(@CurrentUser() user: AuthUser) {
    return this.auth.getProfile(user)
  }

  @Patch("onboarding")
  @UseGuards(JwtAuthGuard)
  updateOnboarding(
    @CurrentUser() user: AuthUser,
    @Body() body: UpdateOnboardingDto,
  ) {
    return this.auth.updateOnboarding(user, body)
  }

  @Post("profile")
  @UseGuards(JwtAuthGuard)
  saveProfile(@CurrentUser() user: AuthUser, @Body() body: CompleteProfileDto) {
    return this.auth.completeProfile(user, body)
  }
}
