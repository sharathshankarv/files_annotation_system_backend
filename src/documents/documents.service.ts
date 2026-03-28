import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserDocuments(userId: string) {
    return this.prisma.file.findMany({
      where: { uploadedById: userId },
      select: {
        id: true,
        name: true,
        size: true,
        mimeType: true,
        updatedAt: true,
      },
    });
  }
}
