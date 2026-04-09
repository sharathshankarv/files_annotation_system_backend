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
    return this.prisma.$transaction(async (tx) => {
      const previousVersion = await tx.file.findFirst({
        where: {
          uploadedById: data.uploadedById,
          name: data.name,
        },
        orderBy: {
          version: 'desc',
        },
        include: {
          annotations: true,
        },
      });

      const nextVersion = previousVersion ? previousVersion.version + 1 : 1;

      const createdFile = await tx.file.create({
        data: {
          ...data,
          version: nextVersion,
        },
      });

      if (previousVersion?.annotations.length) {
        await tx.annotation.createMany({
          data: previousVersion.annotations.map((annotation) => ({
            fileId: createdFile.id,
            createdById: annotation.createdById,
            comment: annotation.comment,
            quotedText: annotation.quotedText,
            highlightColor: annotation.highlightColor,
            page: annotation.page,
            x: annotation.x,
            y: annotation.y,
            width: annotation.width,
            height: annotation.height,
            normalizedX: annotation.normalizedX,
            normalizedY: annotation.normalizedY,
            normalizedWidth: annotation.normalizedWidth,
            normalizedHeight: annotation.normalizedHeight,
          })),
        });
      }

      return createdFile;
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
    const row = await this.prisma.annotation.create({
      data: {
        fileId,
        createdById,
        comment: dto.comment.trim(),
        quotedText: dto.quotedText.trim(),
        highlightColor: dto.highlightColor ?? '#fef08a',
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
      include: {
        createdBy: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    const { createdBy, ...annotation } = row;
    return {
      ...annotation,
      authorName: createdBy?.name || createdBy?.email || 'Unknown',
    };
  }

  async getAnnotations(fileId: string) {
    const rows = await this.prisma.annotation.findMany({
      where: { fileId },
      orderBy: { createdAt: 'asc' },
      include: {
        createdBy: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    return rows.map((row) => {
      const { createdBy, ...annotation } = row;
      return {
        ...annotation,
        authorName: createdBy?.name || createdBy?.email || 'Unknown',
      };
    });
  }
}
