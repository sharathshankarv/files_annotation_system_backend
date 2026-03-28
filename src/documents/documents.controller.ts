import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '@/auth/jwt.auth-gaurd';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  getUserDocuments(@Req() req) {
    const userId = req.user.userId;
    return this.documentsService.getUserDocuments(userId);
  }
}
