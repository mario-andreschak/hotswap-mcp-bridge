/**
 * Logging utilities
 */

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error"
}

/**
 * Logger interface
 */
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  setLevel(level: LogLevel): void;
  setPrefix(prefix: string): void;
}

/**
 * Logger options
 */
export interface LoggerOptions {
  level?: LogLevel;
  prefix?: string;
}

/**
 * Default logger implementation
 */
export class ConsoleLogger implements Logger {
  private level: LogLevel;
  private prefix: string;
  
  constructor(options?: LoggerOptions) {
    this.level = options?.level ?? LogLevel.INFO;
    this.prefix = options?.prefix ? `[${options.prefix}] ` : "";
  }
  
  /**
   * Check if the given level is enabled
   */
  private isLevelEnabled(level: LogLevel): boolean {
    const levels = Object.values(LogLevel);
    const currentLevelIndex = levels.indexOf(this.level);
    const targetLevelIndex = levels.indexOf(level);
    
    return targetLevelIndex >= currentLevelIndex;
  }
  
  /**
   * Format the log message
   */
  private formatMessage(message: string): string {
    return `${this.prefix}${message}`;
  }
  
  /**
   * Log a debug message
   */
  debug(message: string, ...args: unknown[]): void {
    if (this.isLevelEnabled(LogLevel.DEBUG)) {
      console.debug(this.formatMessage(message), ...args);
    }
  }
  
  /**
   * Log an info message
   */
  info(message: string, ...args: unknown[]): void {
    if (this.isLevelEnabled(LogLevel.INFO)) {
      console.info(this.formatMessage(message), ...args);
    }
  }
  
  /**
   * Log a warning message
   */
  warn(message: string, ...args: unknown[]): void {
    if (this.isLevelEnabled(LogLevel.WARN)) {
      console.warn(this.formatMessage(message), ...args);
    }
  }
  
  /**
   * Log an error message
   */
  error(message: string, ...args: unknown[]): void {
    if (this.isLevelEnabled(LogLevel.ERROR)) {
      console.error(this.formatMessage(message), ...args);
    }
  }
  
  /**
   * Set the log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }
  
  /**
   * Set the log prefix
   */
  setPrefix(prefix: string): void {
    this.prefix = prefix ? `[${prefix}] ` : "";
  }
}

/**
 * Create a logger
 */
export function createLogger(options?: LoggerOptions): Logger {
  return new ConsoleLogger(options);
}

/**
 * Global logger instance
 */
export const logger = createLogger();
