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
    // Used to encrypt sensitive profile identifiers (Aadhaar last-4, account
    // last-4) at rest. Required once profile encryption is enabled.
    PROFILE_ENCRYPTION_KEY: optionalSecret,
    CORS_ORIGINS: z
      .string()
      .default("http://localhost:8443,http://127.0.0.1:8443"),
    REDIS_HOST: z.string().optional().default("localhost"),
    REDIS_PORT: z.coerce.number().int().positive().default(6379),
    MINIO_ENDPOINT: z.string().optional().default("localhost"),
    MINIO_PORT: z.coerce.number().int().positive().default(9000),
    MINIO_ACCESS_KEY: z.string().optional().default(""),
    MINIO_SECRET_KEY: z.string().optional().default(""),
    MINIO_BUCKET: z.string().optional().default("cybersathi-evidence"),
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
    GEMINI_TEXT_FALLBACK: z.string().min(1).default("gemini-3.1-flash-lite"),
    // Chat uses a lite model: the full Flash model spends 10-25s thinking on a
    // one-sentence intake reply. Multimodal evidence extraction still uses
    // GEMINI_TEXT_MODEL above.
    GEMINI_CHAT_MODEL: z.string().min(1).default("gemini-3.1-flash-lite"),
    GEMINI_CHAT_FALLBACK: z.string().min(1).default("gemini-3.5-flash-lite"),
    GEMINI_TTS_MODEL: z.string().min(1).default("gemini-3.8-flash-tts"),
    // Image generation needs a paid Gemini tier on this project; the service
    // falls back to a locally rendered SVG infographic so the flow never breaks.
    GEMINI_IMAGE_MODEL: z.string().min(1).default("gemini-3.1-flash-image"),
    GEMINI_IMAGE_FALLBACK: z.string().min(1).default("gemini-3-pro-image"),
    GEMINI_IMAGE_ENABLED: z
      .union([z.boolean(), z.enum(["true", "false"])])
      .transform((value) => value === true || value === "true")
      .default(false),
    GEMINI_VOICE_NAME: z.string().min(1).default("Kore"),
    BLAND_API_KEY: optionalSecret,
    BLAND_AGENT_ID: z.string().optional(),
    BLAND_WEBHOOK_SECRET: optionalSecret,
    BLAND_VOICE: optionalSecret,
    SUPABASE_SECRET_KEY: optionalSecret,
    SUPABASE_EVIDENCE_BUCKET: z.string().optional().default("evidence"),
    SUPABASE_SOCIAL_POSTS_BUCKET: z.string().optional().default("social-posts"),
    REPORT_MODEL_NAME: z.string().optional().default("gemini-3.6-flash"),
    REPORT_MODEL_FALLBACK: z.string().optional().default("gemini-3.1-flash-lite"),
    GEMINI_TTS_VOICE: z.string().optional(),
    SUPABASE_SERVICE_ROLE_KEY: optionalSecret,
    REPORT_MODEL_PROVIDER: z.string().optional().default("gemini"),
    BILINGUAL_MODEL: z.string().optional().default("gemini-3.6-flash"),
    BILINGUAL_FALLBACK: z.string().optional().default("gemini-3.1-flash-lite"),
    GEMINI_LIVE_ENABLED: z.union([z.boolean(), z.enum(["true","false"])]).transform((v)=>v===true||v==="true").default(false),
    FAST_FALLBACK: z.string().optional().default("gemini-3.1-flash-lite"),
    REPORT_PRIMARY: z.string().optional(),
    REPORT_FALLBACK: optionalSecret,
    GROQ_API_KEYS: optionalSecret,
    FAST_MODEL: z.string().optional().default("openai/gpt-oss-20b"),
    COMPLEX_MODEL: z.string().optional().default("gemini-3.6-flash"),
    COMPLEX_FALLBACK: z.string().optional().default("openai/gpt-oss-120b"),
    GEMINI_API_KEYS: optionalSecret,
    GEMINI_IMAGE_KEY: optionalSecret,
    GROQ_API_URL: z.string().url().default("https://api.groq.com/openai/v1"),
    GROQ_WHISPER_MODEL: z.string().min(1).default("whisper-large-v3"),
    CLASSIFICATION_CONFIDENCE_THRESHOLD: z.coerce
      .number()
      .min(0)
      .max(1)
      .default(0.75),
    NCRP_PORTAL_URL: z.string().url().default("https://cybercrime.gov.in/"),
    RBI_OMBUDSMAN_PORTAL_URL: z.string().url().default("https://cms.rbi.org.in/"),
    BHASHINI_API_KEY: optionalSecret,
    BHASHINI_USER_ID: optionalSecret,
    BHASHINI_API_URL: z
      .string()
      .url()
      .default("https://dhruva-api.bhashini.gov.in"),
    REDIS_URL: z.string().optional(),
    // Image generation (primary: Cloudflare)
    IMAGE_PROVIDER: z.string().optional().default("cloudflare"),
    CLOUDFLARE_ACCOUNT_ID: optionalSecret,
    CLOUDFLARE_API_TOKEN: optionalSecret,
    IMAGE_MODEL: z
      .string()
      .optional()
      .default("@cf/black-forest-labs/flux-1-schnell"),
    IMAGE_STEPS: z.coerce.number().int().min(1).max(8).default(4),
    IMAGE_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
    IMAGE_MAX_BYTES: z.coerce.number().int().positive().default(8 * 1024 * 1024),
    IMAGE_MIN_DIMENSION: z.coerce.number().int().positive().default(256),
    IMAGE_MAX_DIMENSION: z.coerce.number().int().positive().default(2048),
    IMAGE_FONT_REGULAR: z
      .string()
      .default("/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf"),
    IMAGE_FONT_BOLD: z
      .string()
      .default("/usr/share/fonts/dejavu-sans-fonts/DejaVuSans-Bold.ttf"),
    IMAGE_FONT_DEVANAGARI: z
      .string()
      .default("/usr/share/fonts/google-noto-vf/NotoSansDevanagari[wght].ttf"),
    IMAGE_FONT_FAMILY: z.string().default("DejaVu Sans"),
    IMAGE_FONT_FAMILY_BOLD: z.string().default("DejaVu Sans"),
    IMAGE_FONT_FAMILY_DEVANAGARI: z.string().default("Noto Sans Devanagari"),
    IMAGE_STORAGE_DIR: z.string().default(".data/generated-images"),
    SUPABASE_IMAGES_BUCKET: z.string().default("case-images"),
    // Image generation (fallback: Pollinations)
    IMAGE_FALLBACK_PROVIDER: z.string().optional().default("pollinations"),
    IMAGE_FALLBACK_URL: z.string().url().optional().default("https://image.pollinations.ai/prompt/"),
    // Fallback voice stack
    FISH_AUDIO_API_KEY: optionalSecret,
    FISH_VOICE_ID: z.string().optional().default("hindi-female-01"),
    GCP_TTS_KEY: optionalSecret,
    GCP_TTS_VOICE: z.string().optional().default("hi-IN-Wavenet-A"),
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
