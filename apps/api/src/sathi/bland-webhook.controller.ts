import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  RawBodyRequest,
  Req,
} from "@nestjs/common"
import type { Request } from "express"
import { ApiOperation, ApiTags } from "@nestjs/swagger"
import { BlandService } from "./bland.service"

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

@Controller("bland")
@ApiTags("bland")
export class BlandWebhookController {
  constructor(private readonly bland: BlandService) {}

  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Receive a signed Bland post-call webhook" })
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers("x-webhook-signature") signature: string | undefined,
  ) {
    if (!request.rawBody) {
      throw new Error(
        "Raw request body is unavailable for Bland signature verification",
      )
    }
    this.bland.verifyWebhookSignature(request.rawBody, signature)

    const body = asRecord(request.body)
    const metadata = asRecord(body?.metadata)
    const variables = asRecord(body?.variables)
    const transcript =
      body?.transcripts ?? body?.transcript ?? body?.transcript_turns ?? []
    const hasTranscript = Array.isArray(transcript) && transcript.length > 0
    // Post-call payloads differ by plan/agent version. Accept an explicit end
    // event, a completed status, or a non-empty transcript so field extraction
    // is not silently skipped.
    const isCallEnded =
      body?.type === "call.ended" ||
      body?.event === "call.ended" ||
      body?.completed === true ||
      body?.status === "completed" ||
      hasTranscript

    if (!body || !isCallEnded) {
      return { received: true }
    }

    const conversationId =
      asString(body.conversation_id) ??
      asString(metadata?.conversation_id) ??
      asString(variables?.conversation_id)
    const blandCallId =
      asString(body.call_id) ??
      asString(body.c_id) ??
      (typeof body.call_id === "number" ? String(body.call_id) : undefined)
    const messages = Array.isArray(transcript)
      ? transcript.flatMap((item: unknown) => {
          const turn = asRecord(item)
          const content = asString(turn?.text) ?? asString(turn?.content)
          const speaker = asString(turn?.role) ?? asString(turn?.user)
          if (!content || !speaker) return []

          return [
            {
              role:
                speaker === "assistant" || speaker === "robot"
                  ? "agent"
                  : speaker,
              content,
              channel: "voice",
              blandTurnId:
                asString(turn.transcript_id) ??
                asString(turn.turn_id) ??
                (typeof turn.id === "number"
                  ? String(turn.id)
                  : asString(turn.id)),
            },
          ]
        })
      : []

    if (conversationId || blandCallId) {
      await this.bland.saveWebhookTranscript(
        conversationId,
        blandCallId,
        messages,
      )
    }

    return { received: true }
  }
}
