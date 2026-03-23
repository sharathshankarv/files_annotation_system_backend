import { FileValidator } from '@nestjs/common';

// 🛡️ Principal Tip: Define your custom validator as a class for reusability
export class CustomFileTypeValidator extends FileValidator {
  constructor() {
    // We pass an empty object to the parent constructor to satisfy 'validationOptions'
    super({});
  }

  // 🛡️ Logic: Check if the file's MIME type is in our allowed list
  isValid(file: Express.Multer.File): boolean {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ];
    return allowedTypes.includes(file.mimetype);
  }

  buildErrorMessage(): string {
    return 'Invalid file type. Please upload a PDF, DOCX, or PPTX document.';
  }
}
