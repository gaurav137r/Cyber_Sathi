import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import type { AppEnv } from "../config/env.schema"

export type Provider = "gemini" | "groq" | "openai"

interface KeyState {
  key: string
  slot: number
  cooldownUntil: number
}

export interface ProviderAttempt<T> {
  value: T
  provider: Provider
  keyId: string
}

function parseKeys(...values: Array<string | undefined>): string[] {
  return [...new Set(
    values
      .flatMap((value) => value?.split(",") ?? [])
      .map((value) => value.trim())
      .filter(Boolean),
  )]
}

@Injectable()
export class KeyPool {
  private readonly logger = new Logger(KeyPool.name)
  private readonly pools = new Map<Provider, KeyState[]>()
  private readonly cursors = new Map<Provider, number>()

  constructor(private readonly config: ConfigService<AppEnv, true>) {
    this.pools.set("gemini", parseKeys(
      config.get("GEMINI_API_KEY", { infer: true }),
      config.get("GEMINI_API_KEYS", { infer: true }),
      config.get("GEMINI_IMAGE_KEY", { infer: true }),
    ).map((key, index) => ({ key, slot: index + 1, cooldownUntil: 0 })))
    this.pools.set("groq", parseKeys(
      this.config.get("GROQ_API_KEYS", { infer: true }) as string | undefined,
    ).map((key, index) => ({ key, slot: index + 1, cooldownUntil: 0 })))
    // OpenAI keys are intentionally excluded from routing. They are known to be invalid.
    this.pools.set("openai", [])
  }

  isKeyAvailable(provider: Provider): boolean {
    return (this.pools.get(provider) ?? []).some((key) => key.cooldownUntil <= Date.now())
  }

  getGroqKey(): Promise<string> {
    return this.withProvider("groq", async (apiKey) => apiKey)
  }

  async withProvider<T>(provider: Provider, operation: (apiKey: string) => Promise<T>): Promise<T> {
    return (await this.withProviderDetailed(provider, operation)).value
  }

  async withProviderDetailed<T>(
    provider: Provider,
    operation: (apiKey: string) => Promise<T>,
  ): Promise<ProviderAttempt<T>> {
    const pool = this.pools.get(provider) ?? []
    const now = Date.now()
    const cursor = this.cursors.get(provider) ?? 0
    const candidates = pool
      .map((key, index) => ({ key, index }))
      .filter(({ key }) => key.cooldownUntil <= now)
      .sort((a, b) => ((a.index - cursor + pool.length) % pool.length) - ((b.index - cursor + pool.length) % pool.length))

    let lastError: unknown
    for (const { key, index } of candidates) {
      this.cursors.set(provider, (index + 1) % Math.max(pool.length, 1))
      try {
        const value = await operation(key.key)
        this.logger.debug(`${provider} key slot ${key.slot} request succeeded`)
        return { value, provider, keyId: `${provider}-key-${key.slot}` }
      } catch (error) {
        lastError = error
        const message = error instanceof Error ? error.message.toLowerCase() : ""
        const cooldown = message.includes("429") || message.includes("quota") || message.includes("rate limit")
          ? 60_000
          : message.includes("network") || message.includes("failed")
            ? 10_000
            : 5 * 60_000
        key.cooldownUntil = Date.now() + cooldown
        this.logger.warn(`${provider} key slot ${key.slot} failed and was cooled down`)
      }
    }

    if (!candidates.length)
      throw new ServiceUnavailableException(`${provider} has no keys available outside cooldown`)
    throw lastError instanceof Error
      ? lastError
      : new ServiceUnavailableException(`${provider} key pool exhausted`)
  }

  async withFallbackDetailed<T>(
    primary: Provider,
    fallback: Provider | undefined,
    operation: (provider: Provider, apiKey: string) => Promise<T>,
  ): Promise<ProviderAttempt<T>> {
    let primaryError: unknown
    try {
      return await this.withProviderDetailed(primary, (key) => operation(primary, key))
    } catch (error) {
      primaryError = error
    }
    if (!fallback || fallback === primary) throw primaryError
    try {
      return await this.withProviderDetailed(fallback, (key) => operation(fallback, key))
    } catch {
      throw new ServiceUnavailableException(
        `${primary} and ${fallback} providers are unavailable`,
      )
    }
  }

  async withFallback<T>(
    primary: Provider,
    fallback: Provider | undefined,
    operation: (provider: Provider, apiKey: string) => Promise<T>,
  ): Promise<T> {
    return (await this.withFallbackDetailed(primary, fallback, operation)).value
  }

  /** Legacy Gemini-only callers must never receive another provider's key. */
  async withFailover<T>(operation: (apiKey: string) => Promise<T>): Promise<T> {
    return this.withProvider("gemini", operation)
  }
}
