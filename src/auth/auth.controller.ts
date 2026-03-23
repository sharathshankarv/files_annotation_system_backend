import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginRequestDto } from './dto/login-request.dto';
import { Public } from '@/common/decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  async login(@Body() dto: LoginRequestDto) {
    const user = await this.authService.validateUser(dto.email, dto.password);
    console.log('🚀 Principal Debug: Received login request with DTO:', user);
    return this.authService.login(user);
  }
}
