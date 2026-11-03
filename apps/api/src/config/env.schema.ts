import { z } from "zod"

const optionalSecret = z
  .string()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined))

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().min(1),
    SUPABASE_URL: z.string().url(),
    SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
    SUPABASE_ANON_KEY: z.string().min(1).optional(),
    CORS_ORIGINS: z
      .string()
      .default("http://localhost:8443,http://127.0.0.1:8443"),
    REDIS_HOST: z.string().min(1),
    REDIS_PORT: z.coerce.number().int().positive().default(6379),
    MINIO_ENDPOINT: z.string().min(1),
    MINIO_PORT: z.coerce.number().int().positive().default(9000),
    MINIO_ACCESS_KEY: z.string().min(1),
    MINIO_SECRET_KEY: z.string().min(1),
    MINIO_BUCKET: z.string().min(1),
    MINIO_USE_SSL: z
      .union([z.boolean(), z.enum(["true", "false"])])
      .transform((value) => value === true || value === "true")
      .default(false),
    STUB_USER_ID: z.string().uuid().optional(),
    GEMINI_API_KEY: optionalSecret,
    GEMINI_API_URL: z
      .string()
      .url()
      .default("https://generativelanguage.googleapis.com"),
    GEMINI_LIVE_MODEL: z.string().min(1).default("gemini-3.8-live"),
    GEMINI_TEXT_MODEL: z.string().min(1).default("gemini-3.6-flash"),
    GEMINI_TTS_MODEL: z.string().min(1).default("gemini-3.8-flash-tts"),
    GEMINI_VOICE_NAME: z.string().min(1).default("Kore"),
  })
  .refine(
    (config) => config.SUPABASE_PUBLISHABLE_KEY || config.SUPABASE_ANON_KEY,
    {
      message: "Set SUPABASE_PUBLISHABLE_KEY or the legacy SUPABASE_ANON_KEY",
      path: ["SUPABASE_PUBLISHABLE_KEY"],
    },
  )

export type AppEnv = z.infer<typeof envSchema>

export function validateEnv(config: Record<string, unknown>): AppEnv {
  const parsed = envSchema.safeParse(config)
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ")
    throw new Error(`Invalid environment configuration: ${details}`)
  }
  return parsed.data
}
