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
  API_PORT: z.preprocess(
    (val) => val ?? process.env.PORT,
    z.coerce.number().int().positive().default(3001),
  ),
  WEB_ORIGIN: z.string().default("*"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  PERSISTENCE_MODE: z.enum(["memory", "postgres"]).default("memory"),
  USE_DEMO_ADAPTERS: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => (process.env.NODE_ENV === "test" ? true : value === "true")),
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_AGENT_ID: z.string().optional(),
  ELEVENLABS_SCAMMER_AGENT_ID: z.string().default("agent_8401m506b9p0fnd88k4623jvfrqh"),
  ELEVENLABS_SCAMMER_EN_AGENT_ID: z.string().default("agent_1701m50fbxptfb19rdyds35gqstc"),
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  GOOGLE_SAFE_BROWSING_API_KEY: z.string().default(""),
  URLHAUS_AUTH_KEY: z.string().default(""),
  DATA_ENCRYPTION_SECRET: z.string().optional(),
  DATA_PEPPER_SECRET: z.string().optional(),
  REVIEWER_API_KEY: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(16).optional(),
  ),
}).superRefine((value, context) => {
  if (value.PERSISTENCE_MODE !== "postgres") return;

  for (const field of ["DATA_ENCRYPTION_SECRET", "DATA_PEPPER_SECRET"] as const) {
    if (!value[field] || value[field].length < 32) {
      context.addIssue({
        code: "custom",
        path: [field],
        message: `${field} must contain at least 32 characters when PERSISTENCE_MODE=postgres`,
      });
    }
  }
});

export const env = envSchema.parse(process.env);
