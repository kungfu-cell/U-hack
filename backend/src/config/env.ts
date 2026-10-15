import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env natively from project root or current working directory
try {
  process.loadEnvFile(path.resolve(__dirname, "../../../.env"));
} catch {
  try {
    process.loadEnvFile(path.resolve(process.cwd(), ".env"));
  } catch {
    // ignore if no .env file
  }
}

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  USE_DEMO_ADAPTERS: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  ELEVENLABS_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_MODEL: z.string().default("gpt-5.6-terra"),
  GOOGLE_SAFE_BROWSING_API_KEY: z.string().default(""),
});

export const env = envSchema.parse(process.env);
