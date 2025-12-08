/**
 * Logger utility with environment-based log levels
 * 
 * Log levels (from most to least verbose):
 * - debug: Detailed information for debugging
 * - info: General informational messages
 * - warn: Warning messages for potential issues
 * - error: Error messages for failures
 * 
 * In production, only 'error' level logs are shown.
 * In development, all logs are shown by default.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Get log level from environment, default to 'debug' in dev, 'error' in production
const getLogLevel = (): LogLevel => {
  const envLevel = import.meta.env.VITE_LOG_LEVEL?.toLowerCase();
  if (envLevel && ['debug', 'info', 'warn', 'error'].includes(envLevel)) {
    return envLevel as LogLevel;
  }
  // Default: debug in dev, error in production
  return import.meta.env.DEV ? 'debug' : 'error';
};

const LOG_LEVEL = getLogLevel();

// Log level hierarchy (higher number = more important)
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const shouldLog = (level: LogLevel): boolean => {
  return LOG_LEVELS[level] >= LOG_LEVELS[LOG_LEVEL];
};

/**
 * Sanitize error messages for production
 * Removes sensitive information like file paths, stack traces, etc.
 */
const sanitizeError = (message: string, isProduction: boolean): string => {
  if (!isProduction) {
    return message;
  }
  
  // Remove file paths
  let sanitized = message.replace(/\/[^\s]+/g, '[path]');
  
  // Remove stack traces
  sanitized = sanitized.split('\n')[0];
  
  // Remove sensitive patterns (adjust as needed)
  sanitized = sanitized.replace(/password|secret|key|token/gi, '[redacted]');
  
  return sanitized;
};

const isProduction = import.meta.env.PROD;

export const logger = {
  /**
   * Log debug messages (detailed information for debugging)
   */
  debug: (message: string, ...args: any[]): void => {
    if (shouldLog('debug')) {
      console.debug(`[DEBUG] ${message}`, ...args);
    }
  },

  /**
   * Log informational messages
   */
  info: (message: string, ...args: any[]): void => {
    if (shouldLog('info')) {
      console.info(`[INFO] ${message}`, ...args);
    }
  },

  /**
   * Log warning messages
   */
  warn: (message: string, ...args: any[]): void => {
    if (shouldLog('warn')) {
      const sanitized = sanitizeError(message, isProduction);
      console.warn(`[WARN] ${sanitized}`, ...args);
    }
  },

  /**
   * Log error messages
   * In production, error messages are sanitized but error objects are always included
   * for debugging purposes (stack traces, error types, etc.)
   */
  error: (message: string, error?: Error | unknown, ...args: any[]): void => {
    if (shouldLog('error')) {
      const sanitized = sanitizeError(message, isProduction);
      
      if (error instanceof Error) {
        // Always include the error object for debugging, even in production
        // The message is sanitized, but error objects contain valuable debugging info
        // (stack traces, error types, etc.) that are essential for production debugging
        console.error(`[ERROR] ${sanitized}`, error, ...args);
      } else if (error) {
        console.error(`[ERROR] ${sanitized}`, error, ...args);
      } else {
        console.error(`[ERROR] ${sanitized}`, ...args);
      }
    }
  },
};
