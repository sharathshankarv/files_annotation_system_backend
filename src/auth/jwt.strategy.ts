import { JWT_CONFIG } from '@/config/auth.config';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ERROR_MESSAGES } from '@/config/messages.config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: JWT_CONFIG.secret,
    });
  }

  validate(payload: any) {
    const currentTime = Math.floor(Date.now() / 1000);

    if (payload.exp < currentTime) {
      throw new UnauthorizedException(ERROR_MESSAGES.tokenExpired);
    }

    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}
