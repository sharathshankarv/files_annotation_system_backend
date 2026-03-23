import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class UploadsService {
  constructor(private prisma: PrismaService) {}

  async saveFile(data: {
    name: string;
    path: string;
    size: number;
    mimeType: string;
    uploadedById: string;
  }) {
    return this.prisma.file.create({
      data,
    });
  }

  async getFileById(id: string) {
    return this.prisma.file.findUnique({
      where: { id },
    });
  }
}
