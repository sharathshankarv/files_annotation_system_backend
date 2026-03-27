import * as winston from 'winston';
import { SplunkTransport } from 'winston-splunk-httplogger';
import { LOGGING_CONFIG } from '@/config/logging.config';

export const splunkLogger = winston.createLogger({
  level: LOGGING_CONFIG.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
      ),
    }),
    ...(process.env.SPLUNK_URL
      ? [
          new SplunkTransport({
            splunk: {
              url: process.env.SPLUNK_URL,
              token: process.env.SPLUNK_TOKEN,
              index: LOGGING_CONFIG.splunkIndex,
            },
            batchInterval: LOGGING_CONFIG.splunkBatchIntervalMs,
          }),
        ]
      : []),
  ],
});
