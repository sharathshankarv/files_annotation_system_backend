import { parseNumber } from './config.utils';

export const LOGGING_CONFIG = {
  level: process.env.LOG_LEVEL || 'info',
  splunkIndex: process.env.SPLUNK_INDEX || 'main',
  splunkBatchIntervalMs: parseNumber(process.env.SPLUNK_BATCH_INTERVAL_MS, 1000),
};
