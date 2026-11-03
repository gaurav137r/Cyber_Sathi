import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common"
import { AuthService, AuthUser } from "./auth.service"

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: { authorization?: string }; user?: AuthUser }>()
    const [scheme, token] = request.headers.authorization?.split(" ") ?? []
    if (scheme?.toLowerCase() !== "bearer" || !token)
      throw new UnauthorizedException("A bearer token is required")
    request.user = await this.auth.authenticateAccessToken(token)
    return true
  }
}
