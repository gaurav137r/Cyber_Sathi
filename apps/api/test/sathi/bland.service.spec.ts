import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import {
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common"
import { BlandService } from "../../src/sathi/bland.service"

const agentId = "209a8a84-d772-401f-9b33-6930cf55c939"
const caseId = "case-uuid"
const userId = "user-uuid"
const apiKey = "test-bland-key"
const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

function createHarness(options: { ownerId?: string } = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const savedConversations: Array<Record<string, unknown>> = []
  const prisma = {
    case: {
      findFirst: async ({ where }: { where: { id: string; userId: string } }) =>
        where.id === caseId && where.userId === (options.ownerId ?? userId)
          ? {
              id: caseId,
              category: "UPI_FRAUD",
              structuredFields: {},
              evidenceItems: [],
              reportVersions: [],
            }
          : null,
    },
    conversation: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        assert.equal(where.caseId, caseId)
        assert.equal(where.userId, userId)
        assert.equal(where.channel, "voice")
        return (
          savedConversations.find(
            (conversation) => conversation.status === "active",
          ) ?? null
        )
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const conversation = { id: "conversation-uuid", ...data }
        savedConversations.push(conversation)
        return conversation
      },
    },
  }
  const config = {
    get: (key: string) =>
      key === "BLAND_API_KEY"
        ? apiKey
        : key === "BLAND_AGENT_ID"
          ? agentId
          : undefined,
  }
  const service = new BlandService(
    config as never,
    prisma as never,
    {} as never,
  )
  globalThis.fetch = ((async (input: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    return new Response(
      JSON.stringify({ token: "single-use-token", status: "success" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    )
  }) as typeof fetch)
  return { service, calls }
}

test("voice authorization sends server-derived case correlation and maps Bland token", async () => {
  const { service, calls } = createHarness()

  const result = await service.createSessionToken(caseId, userId)

  assert.deepEqual(result, { sessionToken: "single-use-token", caseId })
  assert.equal(calls.length, 1)
  assert.equal(
    calls[0].url,
    `https://api.bland.ai/v1/agents/${agentId}/authorize`,
  )
  assert.equal(
    (calls[0].init?.headers as Record<string, string>).Authorization,
    `Bearer ${apiKey}`,
  )
  const payload = JSON.parse(String(calls[0].init?.body))
  assert.deepEqual(payload, {
    environment: "production",
    request_data: {
      case_id: caseId,
      conversation_id: "conversation-uuid",
      language: "hi",
      case_context_json: JSON.stringify({
        caseId,
        category: "UPI_FRAUD",
        confirmedFields: {},
        extractedCandidates: {},
        evidence: [],
        latestReport: null,
      }),
    },
  })
})

test("voice authorization rejects another user's case before calling Bland", async () => {
  const { service, calls } = createHarness({ ownerId: "another-user" })

  await assert.rejects(
    service.createSessionToken(caseId, userId),
    NotFoundException,
  )
  assert.equal(calls.length, 0)
})

test("voice authorization rejects Bland application-level errors", async () => {
  const { service, calls } = createHarness()
  globalThis.fetch = ((async (input: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    return new Response(
      JSON.stringify({ status: "error", message: "rejected" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    )
  }) as typeof fetch)

  await assert.rejects(
    service.createSessionToken(caseId, userId),
    ServiceUnavailableException,
  )
})

test("concurrent voice authorization for one case makes one Bland request", async () => {
  const { service, calls } = createHarness()
  let release: (response: Response) => void
  globalThis.fetch = (((input: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    return new Promise<Response>((resolve) => {
      release = resolve
    })
  }) as typeof fetch)

  const first = service.createSessionToken(caseId, userId)
  const second = service.createSessionToken(caseId, userId)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(calls.length, 1)
  release(
    new Response(JSON.stringify({ token: "single-use-token" }), {
      status: 200,
    }),
  )
  assert.deepEqual(await Promise.all([first, second]), [
    { sessionToken: "single-use-token", caseId },
    { sessionToken: "single-use-token", caseId },
  ])
})

test("voice authorization handles Bland rate-limiting", async () => {
  const { service } = createHarness()
  globalThis.fetch = ((async (input: URL | RequestInfo, init?: RequestInit) => {
    return new Response(
      JSON.stringify({ status: "error", message: "rate limit exceeded" }),
      {
        status: 429,
        headers: { "Content-Type": "application/json" },
      },
    )
  }) as typeof fetch)

  await assert.rejects(
    service.createSessionToken(caseId, userId),
    ServiceUnavailableException,
  )
})
