import * as bcrypt from 'bcrypt';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    try {
      const { name, email, password } = dto;
      const hashedPassword = await bcrypt.hash(password, 10);
      return await this.prisma.user.create({
        data: { email: email, name: name, password: hashedPassword },
        select: { email: true, name: true, role: true },
      });
    } catch (e: unknown) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Email already exists');
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
      select: { email: true, name: true, password: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async findUserByEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { email: true, name: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }
}
