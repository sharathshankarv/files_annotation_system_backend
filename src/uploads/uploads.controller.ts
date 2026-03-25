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

@Controller('uploads')
export class UploadsController {
  constructor(private uploadsService: UploadsService) {}

  @UseGuards(JwtAuthGuard) // 🛡️ Ensure only logged-in users upload
  @Post('document')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads_folder',
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
          new MaxFileSizeValidator({ maxSize: 209715200 }),
          new CustomFileTypeValidator(),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    const userId = req.user.userId; // ✅ Now works

    const savedFile = await this.uploadsService.saveFile({
      name: file.originalname,
      path: `/uploads_folder/${file.filename}`,
      size: file.size,
      mimeType: file.mimetype,
      uploadedById: userId,
    });

    return {
      documentId: savedFile.id, // 🔥 THIS is what FE needs
      name: savedFile.name,
      url: savedFile.path, // optional for now
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getFile(@Param('id') id: string) {
    const file = await this.uploadsService.getFileById(id);

    if (!file) {
      throw new NotFoundException('File not found');
    }

    return {
      documentId: file.id,
      name: file.name,
      url: `http://localhost:8080/uploads/${file.id}/content`,
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
      throw new NotFoundException('File not found');
    }

    const relativePath = file.path.replace(/^\//, '');
    const absolutePath = join(process.cwd(), relativePath);

    if (!existsSync(absolutePath)) {
      throw new NotFoundException('Stored file not found');
    }

    const { size } = statSync(absolutePath);
    const contentType = file.mimeType || 'application/pdf';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Length, Content-Range');

    if (!range) {
      res.setHeader('Content-Length', size);
      createReadStream(absolutePath).pipe(res);
      return;
    }

    const [startValue, endValue] = range.replace(/bytes=/, '').split('-');
    const start = Number.parseInt(startValue, 10);
    const end = endValue ? Number.parseInt(endValue, 10) : size - 1;

    if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= size) {
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
