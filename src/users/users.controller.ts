import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { JwtAuthGuard } from '@/auth/jwt.auth-gaurd';
import { ERROR_MESSAGES } from '@/config/messages.config';

@Controller('users')
export class UsersController {
  constructor(private userService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@Req() req) {
    return this.userService.findUserByEmail(req.user.email);
  }

  @Get()
  async getAll() {
    return this.userService.getAll();
  }

  @Get(':email')
  @UseGuards(JwtAuthGuard)
  async getUserByEmail(@Param('email') email: string) {
    if (!email) {
      throw new BadRequestException(ERROR_MESSAGES.emailRequired);
    }

    return this.userService.findUserByEmail(email);
  }

  @Post()
  async createUser(@Body() dto: CreateUserDto) {
    if (!dto.password) {
      throw new BadRequestException(ERROR_MESSAGES.passwordRequired);
    }

    return this.userService.create({ ...dto });
  }
}
