import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  // 1. Validate the user credentials
  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.usersService.userCompleteDetail(email);

    // Compare plain text password with hashed password in DB
    const isMatch = await bcrypt.compare(pass, user.password);

    if (user && isMatch) {
      const { password, ...result } = user;
      return result;
    }
    throw new UnauthorizedException('Invalid credentials');
  }

  // 2. Generate the JWT "Wrapper" token
  async login(user: any) {
    const payload = {
      email: user.email,
      sub: user.id,
      role: user.role,
    };

    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
