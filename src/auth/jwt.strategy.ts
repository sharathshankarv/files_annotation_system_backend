import { JWT_CONFIG } from '@/config/auth.config';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      // Look for 'Authorization: Bearer <token>'
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: JWT_CONFIG.secret,
      // In prod, use process.env.JWT_SECRET
    });
  }

  /**
   * After the token is verified, this function runs.
   * Whatever you return here is attached to 'req.user'.
   */
  async validate(payload: any) {
    const currentTime = Math.floor(Date.now() / 1000);
    console.log('🔍 Validating JWT payload:', payload, currentTime);
    console.log(
      `🛡️ Auth Guard: Token expires at ${payload.exp}, Current time is ${currentTime}`,
    );

    if (payload.exp < currentTime) {
      console.error('❌ Token has expired!');
      throw new UnauthorizedException('Token expired');
    }

    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}
