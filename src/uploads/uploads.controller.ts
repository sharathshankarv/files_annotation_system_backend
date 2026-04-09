import {
  Body,
  Controller,
  Get,
  Headers,
  MaxFileSizeValidator,
  NotFoundException,
  Param,
  ParseFilePipe,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { createReadStream, existsSync, readFileSync, statSync } from 'fs';
import { extname, join } from 'path';
import { Response } from 'express';
import { CustomFileTypeValidator } from './CustomFileTypeValidator';
import { UploadsService } from './uploads.service';
import { JwtAuthGuard } from '@/auth/jwt.auth-gaurd';
import { FILES_CONFIG } from '@/config/files.config';
import { ERROR_MESSAGES } from '@/config/messages.config';
import { CreateAnnotationDto } from './dto/create-annotation.dto';
import { applyAnnotationsToDocxBuffer } from './docx-annotation.util';
import { applyAnnotationsToPdfBuffer } from './pdf-annotation.util';

const DOCX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PDF_MIME_TYPE = 'application/pdf';

@Controller('uploads')
export class UploadsController {
  constructor(private uploadsService: UploadsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('document')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: FILES_CONFIG.uploadDirectoryPath,
        filename: (req, file, callback) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          callback(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  async uploadFile(
    @Req() req,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: FILES_CONFIG.maxFileSizeBytes }),
          new CustomFileTypeValidator(),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    const userId = req.user.userId;
    const savedFile = await this.uploadsService.saveFile({
      name: file.originalname,
      path: `${FILES_CONFIG.uploadRoutePrefix}/${file.filename}`,
      size: file.size,
      mimeType: file.mimetype,
      uploadedById: userId,
    });

    return {
      documentId: savedFile.id,
      name: savedFile.name,
      version: savedFile.version,
      url: savedFile.path,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getFile(@Req() req, @Param('id') id: string) {
    const file = await this.uploadsService.getFileByIdForUser(id, req.user.userId);

    if (!file) {
      throw new NotFoundException(ERROR_MESSAGES.fileNotFound);
    }

    return {
      documentId: file.id,
      name: file.name,
      version: file.version,
      url: `/uploads/${file.id}/content`,
      mimeType: file.mimeType,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/annotations')
  async createAnnotation(
    @Req() req,
    @Param('id') id: string,
    @Body() payload: CreateAnnotationDto,
  ) {
    const file = await this.uploadsService.getFileByIdForUser(id, req.user.userId);

    if (!file) {
      throw new NotFoundException(ERROR_MESSAGES.fileNotFound);
    }

    return this.uploadsService.createAnnotation(id, req.user.userId, payload);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/annotations')
  async getAnnotations(@Req() req, @Param('id') id: string) {
    const file = await this.uploadsService.getFileByIdForUser(id, req.user.userId);

    if (!file) {
      throw new NotFoundException(ERROR_MESSAGES.fileNotFound);
    }

    return this.uploadsService.getAnnotations(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/download')
  async downloadFile(@Req() req, @Param('id') id: string, @Res() res: Response) {
    const file = await this.uploadsService.getFileByIdForUser(id, req.user.userId);

    if (!file) {
      throw new NotFoundException(ERROR_MESSAGES.fileNotFound);
    }

    const relativePath = file.path.replace(/^\//, '');
    const absolutePath = join(process.cwd(), relativePath);

    if (!existsSync(absolutePath)) {
      throw new NotFoundException(ERROR_MESSAGES.storedFileNotFound);
    }

    res.setHeader('Content-Type', file.mimeType || FILES_CONFIG.defaultStreamMimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);

    if (file.mimeType !== DOCX_MIME_TYPE && file.mimeType !== PDF_MIME_TYPE) {
      createReadStream(absolutePath).pipe(res);
      return;
    }

    const [sourceBuffer, annotations] = await Promise.all([
      Promise.resolve(readFileSync(absolutePath)),
      this.uploadsService.getAnnotations(id),
    ]);

    const annotatedBuffer =
      file.mimeType === DOCX_MIME_TYPE
        ? await applyAnnotationsToDocxBuffer(sourceBuffer, annotations)
        : await applyAnnotationsToPdfBuffer(sourceBuffer, annotations);

    res.send(annotatedBuffer);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/content')
  async streamFile(
    @Req() req,
    @Param('id') id: string,
    @Headers('range') range: string | undefined,
    @Res() res: Response,
  ) {
    const file = await this.uploadsService.getFileByIdForUser(id, req.user.userId);

    if (!file) {
      throw new NotFoundException(ERROR_MESSAGES.fileNotFound);
    }

    const relativePath = file.path.replace(/^\//, '');
    const absolutePath = join(process.cwd(), relativePath);

    if (!existsSync(absolutePath)) {
      throw new NotFoundException(ERROR_MESSAGES.storedFileNotFound);
    }

    const { size } = statSync(absolutePath);
    const contentType = file.mimeType || FILES_CONFIG.defaultStreamMimeType;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', FILES_CONFIG.contentRangeUnit);
    res.setHeader(
      'Access-Control-Expose-Headers',
      FILES_CONFIG.accessControlExposeHeaders,
    );

    if (!range) {
      res.setHeader('Content-Length', size);
      createReadStream(absolutePath).pipe(res);
      return;
    }

    const [startValue, endValue] = range.replace(/bytes=/, '').split('-');
    const start = Number.parseInt(startValue, 10);
    const end = endValue ? Number.parseInt(endValue, 10) : size - 1;

    if (
      Number.isNaN(start) ||
      Number.isNaN(end) ||
      start > end ||
      end >= size
    ) {
      res.status(416).setHeader('Content-Range', `bytes */${size}`);
      res.end();
      return;
    }

    const chunkSize = end - start + 1;

    res.status(206);
    res.setHeader('Content-Length', chunkSize);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);

    createReadStream(absolutePath, { start, end }).pipe(res);
  }
}
