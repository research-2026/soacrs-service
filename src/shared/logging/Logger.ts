/**
 * Application logger based on pino.
 * This provides structured, JSON logs suitable for production.
 */
import pino, { Logger as PinoLogger } from 'pino';
import { config } from '../config/Config';

export interface AppLogger extends PinoLogger {}

const level = process.env.LOG_LEVEL || (config.env === 'production' ? 'info' : 'debug');

export const logger: AppLogger = pino({
  level,
  base: {
    service: config.serviceName,
    version: config.serviceVersion,
    env: config.env,
  },
  transport:
    config.env === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});
