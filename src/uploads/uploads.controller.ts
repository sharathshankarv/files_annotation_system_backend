import {
  Controller,
  Post,
  Get,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  Req,
  UseGuards,
  Param,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
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
      url: `http://localhost:8080${file.path}`,
    };
  }
}
