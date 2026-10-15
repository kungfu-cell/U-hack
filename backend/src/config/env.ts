import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  USE_DEMO_ADAPTERS: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  ELEVENLABS_API_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);

