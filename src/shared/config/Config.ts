/**
 * Runtime configuration for the SOACRS service.
 *
 * This centralises environment variables and provides
 * typed access throughout the codebase.
 */
import dotenv from 'dotenv';

dotenv.config();

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  port: number;
  serviceName: string;
  serviceVersion: string;
}

const DEFAULT_PORT = 4000;

function parsePort(raw: string | undefined, fallback: number): number {
  const port = raw ? Number(raw) : fallback;
  if (Number.isNaN(port) || port <= 0) {
    return fallback;
  }
  return port;
}

/**
 * Load configuration from environment variables with sane defaults.
 */
export const config: AppConfig = {
  env: (process.env.NODE_ENV as AppConfig['env']) || 'development',
  port: parsePort(process.env.PORT, DEFAULT_PORT),
  serviceName: process.env.SERVICE_NAME || 'soacrs-service',
  serviceVersion: process.env.SERVICE_VERSION || '0.1.0',
};
