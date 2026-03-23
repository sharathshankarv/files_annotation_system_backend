import * as winston from 'winston';
import { SplunkTransport } from 'winston-splunk-httplogger';

// 🛡️ Principal Strategy: Centralized Logger Instance
export const splunkLogger = winston.createLogger({
  level: 'info',
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
    // 🛡️ Only enable Splunk if config exists (Environment-Proof)
    ...(process.env.SPLUNK_URL
      ? [
          new SplunkTransport({
            splunk: {
              url: process.env.SPLUNK_URL,
              token: process.env.SPLUNK_TOKEN,
              index: process.env.SPLUNK_INDEX || 'main',
            },
          }),
        ]
      : []),
  ],
});
