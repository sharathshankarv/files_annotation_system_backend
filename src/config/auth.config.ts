import { parseNumber } from './config.utils';

export const JWT_CONFIG = {
  secret: process.env.JWT_SECRET || 'dev_jwt_secret_change_me',
  expiresIn: parseNumber(process.env.JWT_EXPIRES_IN_SECONDS, 3600),
};
