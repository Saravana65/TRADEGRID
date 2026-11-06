/**
 * Simple structured console logger for TRADEGRID Backend.
 * Standardizes log format with timestamps, log levels, and context.
 */

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

function formatMessage(level: LogLevel, message: string, meta?: unknown): string {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` | ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level}] ${message}${metaStr}`;
}

export const logger = {
  info: (message: string, meta?: unknown) => {
    console.log(formatMessage('INFO', message, meta));
  },
  warn: (message: string, meta?: unknown) => {
    console.warn(formatMessage('WARN', message, meta));
  },
  error: (message: string, meta?: unknown) => {
    console.error(formatMessage('ERROR', message, meta));
  },
  debug: (message: string, meta?: unknown) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(formatMessage('DEBUG', message, meta));
    }
  },
};
