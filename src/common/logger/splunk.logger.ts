import * as winston from 'winston';
import { SplunkTransport } from 'winston-splunk-httplogger';

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
        url: process.env.SPLUNK_URL, // e.g., https://prd-p-XXXX.splunkcloud.com:8088
      },
      batchInterval: 1000, // 🛡️ Performance: Batch logs every 1s
    }),
  ],
});
