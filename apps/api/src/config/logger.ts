import pino from 'pino';
import { config } from './env';

export const logger = pino({
  level: config.isDev ? 'debug' : 'info',
  transport: config.isDev
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  base: { service: 'api-gateway' },
  serializers: pino.stdSerializers,
});
