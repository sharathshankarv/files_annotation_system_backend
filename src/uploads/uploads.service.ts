import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateAnnotationDto } from './dto/create-annotation.dto';

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

  async getFileByIdForUser(id: string, userId: string) {
    return this.prisma.file.findFirst({
      where: {
        id,
        uploadedById: userId,
      },
    });
  }

  async createAnnotation(
    fileId: string,
    createdById: string,
    dto: CreateAnnotationDto,
  ) {
    return this.prisma.annotation.create({
      data: {
        fileId,
        createdById,
        comment: dto.comment.trim(),
        quotedText: dto.quotedText.trim(),
        page: dto.page,
        x: dto.x,
        y: dto.y,
        width: dto.width,
        height: dto.height,
        normalizedX: dto.normalizedX,
        normalizedY: dto.normalizedY,
        normalizedWidth: dto.normalizedWidth,
        normalizedHeight: dto.normalizedHeight,
      },
    });
  }

  async getAnnotations(fileId: string) {
    return this.prisma.annotation.findMany({
      where: { fileId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
