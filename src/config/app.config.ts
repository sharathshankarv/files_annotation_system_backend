import { parseCommaSeparated, parseNumber } from './config.utils';

const defaultCorsOrigins = ['http://localhost:3000'];
const configuredOrigins = parseCommaSeparated(process.env.CORS_ORIGIN);

export const SERVER_CONFIG = {
  port: parseNumber(process.env.PORT, 8080),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:8080',
};

export const CORS_CONFIG = {
  origin: configuredOrigins.length ? configuredOrigins : defaultCorsOrigins,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
  exposedHeaders: ['Accept-Ranges', 'Content-Length', 'Content-Range'],
};
