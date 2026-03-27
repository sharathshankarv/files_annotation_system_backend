import * as winston from 'winston';
import { SplunkTransport } from 'winston-splunk-httplogger';
import { LOGGING_CONFIG } from '@/config/logging.config';

export const logger = winston.createLogger({
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
      ),
    }),
    new SplunkTransport({
      splunk: {
        token: process.env.SPLUNK_TOKEN,
        url: process.env.SPLUNK_URL,
        index: LOGGING_CONFIG.splunkIndex,
      },
      batchInterval: LOGGING_CONFIG.splunkBatchIntervalMs,
    }),
  ],
});
