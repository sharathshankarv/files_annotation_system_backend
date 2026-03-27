const parseNumber = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const parseOrigins = (value: string | undefined): string[] => {
  if (!value) {
    return ['http://localhost:3000'];
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
};

export const SERVER_CONFIG = {
  port: parseNumber(process.env.PORT, 8080),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:8080',
};

export const CORS_CONFIG = {
  origin: parseOrigins(process.env.CORS_ORIGIN),
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
  exposedHeaders: ['Accept-Ranges', 'Content-Length', 'Content-Range'],
};
