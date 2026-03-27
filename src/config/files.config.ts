const parseNumber = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const uploadDirectoryName = process.env.UPLOAD_DIRECTORY_NAME || 'uploads_folder';

export const FILES_CONFIG = {
  uploadDirectoryName,
  uploadDirectoryPath: `./${uploadDirectoryName}`,
  uploadRoutePrefix: `/${uploadDirectoryName}`,
  maxFileSizeBytes: parseNumber(
    process.env.MAX_FILE_SIZE_BYTES,
    200 * 1024 * 1024,
  ),
  allowedFileTypes: [
    'image/png',
    'image/jpeg',
    'application/pdf',
    'text/plain',
  ],
  allowedDocumentMimeTypes: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ],
  defaultStreamMimeType: 'application/pdf',
  contentRangeUnit: 'bytes',
  accessControlExposeHeaders: 'Accept-Ranges, Content-Length, Content-Range',
};

export const filesConfig = FILES_CONFIG;
