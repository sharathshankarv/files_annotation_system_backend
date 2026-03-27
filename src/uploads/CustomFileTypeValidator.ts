import { FileValidator } from '@nestjs/common';
import { FILES_CONFIG } from '@/config/files.config';
import { ERROR_MESSAGES } from '@/config/messages.config';

export class CustomFileTypeValidator extends FileValidator {
  constructor() {
    super({});
  }

  isValid(file: Express.Multer.File): boolean {
    return FILES_CONFIG.allowedDocumentMimeTypes.includes(file.mimetype);
  }

  buildErrorMessage(): string {
    return ERROR_MESSAGES.invalidFileType;
  }
}
