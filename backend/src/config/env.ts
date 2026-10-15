import { z } from "zod";

const envSchema = z
  .object({
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
    GOOGLE_WEB_RISK_API_KEY: z.string().default(""),
  })
  .superRefine((value, context) => {
    if (value.USE_DEMO_ADAPTERS) return;
    if (!value.OPENAI_API_KEY) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OPENAI_API_KEY"],
        message: "OPENAI_API_KEY is required when demo adapters are disabled",
      });
    }
    if (!value.GOOGLE_WEB_RISK_API_KEY) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GOOGLE_WEB_RISK_API_KEY"],
        message:
          "GOOGLE_WEB_RISK_API_KEY is required when demo adapters are disabled",
      });
    }
  });

export const env = envSchema.parse(process.env);
