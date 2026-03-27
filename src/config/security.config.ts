import { parseNumber } from './config.utils';

export const SECURITY_CONFIG = {
  bcryptSaltRounds: parseNumber(process.env.BCRYPT_SALT_ROUNDS, 10),
};
