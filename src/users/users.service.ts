import * as bcrypt from 'bcrypt';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { SECURITY_CONFIG } from '@/config/security.config';
import { ERROR_MESSAGES } from '@/config/messages.config';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    try {
      const { name, email, password } = dto;
      const hashedPassword = await bcrypt.hash(
        password,
        SECURITY_CONFIG.bcryptSaltRounds,
      );
      return await this.prisma.user.create({
        data: { email, name, password: hashedPassword },
        select: { email: true, name: true, role: true },
      });
    } catch (e: unknown) {
      if (
        e instanceof PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(ERROR_MESSAGES.emailAlreadyExists);
      }
      throw e;
    }
  }

  async getAll() {
    return this.prisma.user.findMany({
      select: { email: true, name: true, role: true },
    });
  }

  async userCompleteDetail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, password: true, role: true },
    });

    if (!user) {
      throw new NotFoundException(ERROR_MESSAGES.userNotFound);
    }

    return user;
  }

  async findUserByEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { email: true, name: true, role: true },
    });

    if (!user) {
      throw new NotFoundException(ERROR_MESSAGES.userNotFound);
    }

    return user;
  }
}