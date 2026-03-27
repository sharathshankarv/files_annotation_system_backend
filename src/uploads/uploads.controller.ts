import {
  Controller,
  Post,
  Get,
  Headers,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  Req,
  UseGuards,
  Param,
  NotFoundException,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { createReadStream, existsSync, statSync } from 'fs';
import { extname, join } from 'path';
import { Response } from 'express';
import { CustomFileTypeValidator } from './CustomFileTypeValidator';
import { UploadsService } from './uploads.service';
import { JwtAuthGuard } from '@/auth/jwt.auth-gaurd';
import { FILES_CONFIG } from '@/config/files.config';
import { ERROR_MESSAGES } from '@/config/messages.config';

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
      url: savedFile.path,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getFile(@Param('id') id: string) {
    const file = await this.uploadsService.getFileById(id);

    if (!file) {
      throw new NotFoundException(ERROR_MESSAGES.fileNotFound);
    }

    return {
      documentId: file.id,
      name: file.name,
      url: `/uploads/${file.id}/content`,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/content')
  async streamFile(
    @Param('id') id: string,
    @Headers('range') range: string | undefined,
    @Res() res: Response,
  ) {
    const file = await this.uploadsService.getFileById(id);

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
