const parseNumber = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export const LOGGING_CONFIG = {
  level: process.env.LOG_LEVEL || 'info',
  splunkIndex: process.env.SPLUNK_INDEX || 'main',
  splunkBatchIntervalMs: parseNumber(
    process.env.SPLUNK_BATCH_INTERVAL_MS,
    1000,
  ),
};
