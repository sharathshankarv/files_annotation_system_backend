import { FileValidator } from '@nestjs/common';
import { FILES_CONFIG } from '@/config/files.config';
import { ERROR_MESSAGES } from '@/config/messages.config';
import { extname } from 'path';

export class CustomFileTypeValidator extends FileValidator {
  constructor() {
    super({});
  }

  isValid(file: Express.Multer.File): boolean {
    const extension = extname(file.originalname || '').toLowerCase();
    return (
      FILES_CONFIG.allowedDocumentMimeTypes.includes(file.mimetype) ||
      FILES_CONFIG.allowedDocumentExtensions.includes(extension)
    );
  }

  buildErrorMessage(): string {
    return ERROR_MESSAGES.invalidFileType;
  }
}
