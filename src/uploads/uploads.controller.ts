import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  MaxFileSizeValidator,
  NotFoundException,
  Param,
  ParseFilePipe,
  Post,
  Patch,
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
import { MockAnnotationRequestDto } from './dto/mock-annotation-request.dto';
import { MockFullDocScanRequestDto } from './dto/mock-full-doc-scan-request.dto';
import { UpdateAnnotationDto } from './dto/update-annotation.dto';
import { applyAnnotationsToDocxBuffer } from './docx-annotation.util';
import { applyAnnotationsToPdfBuffer } from './pdf-annotation.util';
import { extractSlidesFromPptxBuffer } from './pptx-slide.util';
import {
  ensurePresentationPdfPreview,
  resolvePresentationPreviewPath,
} from './presentation-preview.util';

const DOCX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PDF_MIME_TYPE = 'application/pdf';
const PPTX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const PPT_MIME_TYPE = 'application/vnd.ms-powerpoint';

function resolveUploadedMimeType(file: Express.Multer.File): string {
  const extension = extname(file.originalname || '').toLowerCase();

  if (extension === '.pdf') {
    return PDF_MIME_TYPE;
  }
  if (extension === '.docx') {
    return DOCX_MIME_TYPE;
  }
  if (extension === '.pptx') {
    return PPTX_MIME_TYPE;
  }
  if (extension === '.ppt') {
    return PPT_MIME_TYPE;
  }

  return file.mimetype;
}

function inferFileExtension(fileNameOrPath: string | null | undefined): string {
  return extname(fileNameOrPath || '').toLowerCase();
}

function isPptxDocument(file: { mimeType?: string | null; name?: string | null; path?: string | null }): boolean {
  const nameExt = inferFileExtension(file.name);
  const pathExt = inferFileExtension(file.path);
  const extension = nameExt || pathExt;

  if (extension === '.pptx') {
    return true;
  }
  if (extension === '.ppt') {
    return false;
  }

  return file.mimeType === PPTX_MIME_TYPE;
}

function isLegacyPptDocument(file: { mimeType?: string | null; name?: string | null; path?: string | null }): boolean {
  const nameExt = inferFileExtension(file.name);
  const pathExt = inferFileExtension(file.path);
  const extension = nameExt || pathExt;

  if (extension === '.pptx') {
    return false;
  }
  if (extension === '.ppt') {
    return true;
  }

  return (
    file.mimeType === PPT_MIME_TYPE
  );
}

function isPresentationDocument(file: {
  mimeType?: string | null;
  name?: string | null;
  path?: string | null;
}): boolean {
  return isPptxDocument(file) || isLegacyPptDocument(file);
}

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
    const resolvedMimeType = resolveUploadedMimeType(file);
    const savedFile = await this.uploadsService.saveFile({
      name: file.originalname,
      path: `${FILES_CONFIG.uploadRoutePrefix}/${file.filename}`,
      size: file.size,
      mimeType: resolvedMimeType,
      uploadedById: userId,
    });

    if (isPresentationDocument({ mimeType: resolvedMimeType, name: savedFile.name })) {
      const sourceRelativePath = savedFile.path.replace(/^\//, '');
      const sourceAbsolutePath = join(process.cwd(), sourceRelativePath);
      const previewAbsolutePath = resolvePresentationPreviewPath(sourceAbsolutePath);
      void ensurePresentationPdfPreview(sourceAbsolutePath, previewAbsolutePath);
    }

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

    const sourceRelativePath = file.path.replace(/^\//, '');
    const sourceAbsolutePath = join(process.cwd(), sourceRelativePath);
    const presentationPreviewUrl = `/uploads/${file.id}/preview-content`;
    let resolvedUrl = `/uploads/${file.id}/content`;
    let resolvedMimeType = file.mimeType;

    if (isPresentationDocument(file) && existsSync(sourceAbsolutePath)) {
      const previewAbsolutePath = resolvePresentationPreviewPath(sourceAbsolutePath);
      const hasPreview = await ensurePresentationPdfPreview(
        sourceAbsolutePath,
        previewAbsolutePath,
      );

      if (hasPreview) {
        resolvedUrl = presentationPreviewUrl;
        resolvedMimeType = PDF_MIME_TYPE;
      }
    }

    return {
      documentId: file.id,
      name: file.name,
      version: file.version,
      url: resolvedUrl,
      mimeType: resolvedMimeType,
      sourceMimeType: file.mimeType,
      presentationPreviewUrl,
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
  @Patch(':id/annotations/:annotationId')
  async updateAnnotation(
    @Req() req,
    @Param('id') id: string,
    @Param('annotationId') annotationId: string,
    @Body() payload: UpdateAnnotationDto,
  ) {
    const file = await this.uploadsService.getFileByIdForUser(id, req.user.userId);
    if (!file) {
      throw new NotFoundException(ERROR_MESSAGES.fileNotFound);
    }

    const updated = await this.uploadsService.updateAnnotation(id, annotationId, payload);
    if (!updated) {
      throw new NotFoundException('Annotation not found for this document.');
    }

    return updated;
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/mock-auto-annotations')
  async getMockAutoAnnotations(
    @Req() req,
    @Param('id') id: string,
    @Body() payload: MockAnnotationRequestDto,
  ) {
    const file = await this.uploadsService.getFileByIdForUser(id, req.user.userId);

    if (!file) {
      throw new NotFoundException(ERROR_MESSAGES.fileNotFound);
    }

    if (payload.mockResponses?.length) {
      return payload.mockResponses;
    }

    return [
      {
        text: payload.selectedText,
        pageNumber: 1,
        color: 'RED',
        documentRef: payload.documentRef ?? `DOC-${id.slice(0, 8).toUpperCase()}`,
      },
      {
        text: `${payload.selectedText} (related excerpt)`,
        pageNumber: 1,
        color: 'BLUE',
        documentRef: payload.documentRef ?? `DOC-${id.slice(0, 8).toUpperCase()}`,
      },
    ];
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/mock-full-doc-references')
  async getMockFullDocReferences(
    @Req() req,
    @Param('id') id: string,
    @Body() payload: MockFullDocScanRequestDto,
  ) {
    const file = await this.uploadsService.getFileByIdForUser(id, req.user.userId);

    if (!file) {
      throw new NotFoundException(ERROR_MESSAGES.fileNotFound);
    }

    console.log('[MockFullDocReferences] Received paragraphs:', (payload.paragraphs ?? []).map((p) => ({
      pageNumber: p.pageNumber,
      text: p.text,
    })));

    const mockFilePath = join(process.cwd(), 'mock-data', 'full-doc-scan-response.json');
    if (!existsSync(mockFilePath)) {
      return [];
    }

    try {
      const raw = readFileSync(mockFilePath, 'utf-8');
      const parsed = JSON.parse(raw) as Array<{
        foundRef: string;
        pagenum: number;
        docuementLink: string;
      }>;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
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

    if (isPresentationDocument(file)) {
      const previewAbsolutePath = resolvePresentationPreviewPath(absolutePath);
      const hasPreview = await ensurePresentationPdfPreview(
        absolutePath,
        previewAbsolutePath,
      );

      if (hasPreview && existsSync(previewAbsolutePath)) {
        const annotations = await this.uploadsService.getAnnotations(id);
        const previewBuffer = readFileSync(previewAbsolutePath);
        const annotatedBuffer = await applyAnnotationsToPdfBuffer(
          previewBuffer,
          annotations,
        );
        const outputName = file.name.replace(/\.(pptx?|PPTX?)$/, '.pdf');
        res.setHeader('Content-Type', PDF_MIME_TYPE);
        res.setHeader('Content-Disposition', `attachment; filename="${outputName}"`);
        res.send(annotatedBuffer);
        return;
      }
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
  @Get(':id/ppt/slides')
  async getPptSlides(@Req() req, @Param('id') id: string) {
    const file = await this.uploadsService.getFileByIdForUser(id, req.user.userId);

    if (!file) {
      throw new NotFoundException(ERROR_MESSAGES.fileNotFound);
    }

    if (!isPptxDocument(file) && !isLegacyPptDocument(file)) {
      throw new BadRequestException('Slide preview is currently available only for PPTX files.');
    }

    if (isLegacyPptDocument(file)) {
      throw new BadRequestException(
        'Legacy PPT files are not supported for preview. Please convert and upload a PPTX file.',
      );
    }

    const relativePath = file.path.replace(/^\//, '');
    const absolutePath = join(process.cwd(), relativePath);

    if (!existsSync(absolutePath)) {
      throw new NotFoundException(ERROR_MESSAGES.storedFileNotFound);
    }

    const sourceBuffer = readFileSync(absolutePath);
    let slides: Awaited<ReturnType<typeof extractSlidesFromPptxBuffer>>;

    try {
      slides = await extractSlidesFromPptxBuffer(sourceBuffer);
    } catch {
      throw new BadRequestException(
        'This presentation could not be previewed. Please upload a PPTX file for slide preview.',
      );
    }

    return {
      documentId: file.id,
      name: file.name,
      slideCount: slides.length,
      slides,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/preview-content')
  async streamPreviewFile(
    @Req() req,
    @Param('id') id: string,
    @Headers('range') range: string | undefined,
    @Res() res: Response,
  ) {
    const file = await this.uploadsService.getFileByIdForUser(id, req.user.userId);

    if (!file) {
      throw new NotFoundException(ERROR_MESSAGES.fileNotFound);
    }

    if (!isPresentationDocument(file)) {
      throw new BadRequestException('Preview conversion is available only for presentations.');
    }

    const sourceRelativePath = file.path.replace(/^\//, '');
    const sourceAbsolutePath = join(process.cwd(), sourceRelativePath);

    if (!existsSync(sourceAbsolutePath)) {
      throw new NotFoundException(ERROR_MESSAGES.storedFileNotFound);
    }

    const previewAbsolutePath = resolvePresentationPreviewPath(sourceAbsolutePath);
    const hasPreview = await ensurePresentationPdfPreview(
      sourceAbsolutePath,
      previewAbsolutePath,
    );

    if (!hasPreview || !existsSync(previewAbsolutePath)) {
      throw new BadRequestException(
        'Styled presentation preview is unavailable on this server. Configure GOTENBERG_URL or LibreOffice, or use PPTX text preview mode.',
      );
    }

    const { size } = statSync(previewAbsolutePath);

    res.setHeader('Content-Type', PDF_MIME_TYPE);
    res.setHeader('Accept-Ranges', FILES_CONFIG.contentRangeUnit);
    res.setHeader(
      'Access-Control-Expose-Headers',
      FILES_CONFIG.accessControlExposeHeaders,
    );

    if (!range) {
      res.setHeader('Content-Length', size);
      createReadStream(previewAbsolutePath).pipe(res);
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

    createReadStream(previewAbsolutePath, { start, end }).pipe(res);
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
