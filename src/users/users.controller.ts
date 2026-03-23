import * as bcrypt from 'bcrypt';
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

@Controller('users')
export class UsersController {
  constructor(private userService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@Req() req) {
    return this.userService.findUserByEmail(req.user.email);
  }

  @Get()
  // @UseGuards(JwtAuthGuard)
  async getAll() {
    return this.userService.getAll();
  }

  @Get(':email')
  @UseGuards(JwtAuthGuard)
  async getUserByEmail(@Param('email') email: string) {
    if (!email) {
      throw new BadRequestException('Email is required');
    }

    return this.userService.findUserByEmail(email);
  }

  @Post()
  async createUser(@Body() dto: CreateUserDto) {
    if (!dto.password) {
      throw new BadRequestException('Password is required');
    }

    return this.userService.create({ ...dto });
  }
}
