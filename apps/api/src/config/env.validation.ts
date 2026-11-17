import { z } from "zod"

const booleanFromString = z
  .enum(["true", "false"])
  .transform((value) => value === "true")

export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  MINIO_ENDPOINT: z.string().min(1),
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_USE_SSL: booleanFromString.default("false"),
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(1),
  MINIO_BUCKET: z.string().min(3),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  OTP_PEPPER: z.string().min(32),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(2592000),
  BHASHINI_API_URL: z
    .string()
    .url()
    .default("https://dhruva-api.bhashini.gov.in/services/inference/pipeline"),
  BHASHINI_API_KEY: z.string().min(1).optional(),
  BHASHINI_USER_ID: z.string().min(1).optional(),
  BHASHINI_ASR_SERVICE_ID: z.string().min(1).default("bhashini/asr"),
  BHASHINI_TRANSLATION_SERVICE_ID: z
    .string()
    .min(1)
    .default("bhashini/translation"),
  BHASHINI_TTS_SERVICE_ID: z.string().min(1).default("bhashini/tts"),
  LLM_API_URL: z
    .string()
    .url()
    .default("https://api.groq.com/openai/v1/chat/completions"),
  LLM_API_KEY: z.string().min(1).optional(),
  LLM_MODEL: z.string().min(1).default("openai/gpt-oss-20b"),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_API_URL: z
    .string()
    .url()
    .default("https://generativelanguage.googleapis.com"),
  GEMINI_LIVE_MODEL: z.string().min(1).default("gemini-3.8-live"),
  GEMINI_TEXT_MODEL: z.string().min(1).default("gemini-3.6-flash"),
  GEMINI_VOICE_NAME: z.string().min(1).default("Kore"),
  CLASSIFICATION_CONFIDENCE_THRESHOLD: z.coerce
    .number()
    .min(0)
    .max(1)
    .default(0.75),
  NCRP_PORTAL_URL: z.string().url().default("https://cybercrime.gov.in/"),
  RBI_OMBUDSMAN_PORTAL_URL: z.string().url().default("https://cms.rbi.org.in/"),
})

export type Environment = z.infer<typeof envSchema>

export function validateEnvironment(
  config: Record<string, unknown>,
): Environment {
  const result = envSchema.safeParse(config)
  if (!result.success) {
    throw new Error(
      `Invalid environment configuration: ${result.error.message}`,
    )
  }
  return result.data
}
