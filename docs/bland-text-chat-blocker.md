# Bland API text chat integration blocker

Saathi's production agent currently reports `apiChat.enabled: true`, but the
current Bland documentation index does not publish the direct Agent API chat
routes described in the integration request. The documented `pathway/chat`
routes require a legacy pathway ID, and the web chat widget requires a widget
configuration. Neither is interchangeable with this Agent's API chat channel.

References: [Bland API documentation index](https://docs.bland.ai/llms.txt),
[documented Web Agent authorization](https://docs.bland.ai/api-v1/post/agents-id-authorize),
and [legacy pathway chat](https://docs.bland.ai/api-v1/post/pathway-chat-create).

The documented Agent authorization endpoint is implemented for voice. The app
currently shows the voice transcript; it does not offer a text composer. Custom
text chat remains blocked until Bland provides or confirms the API Chat request
and response schemas for:

- open conversation (`POST /v1/chat`)
- send message (`POST /v1/chat/:conversationId/messages`)
- read conversation (`GET /v1/chat/:conversationId`)
- end conversation (`POST /v1/chat/:conversationId/end`)

Before implementing text chat, confirm the conversation ID field returned on
open, message response and status fields, end/handoff statuses, error payloads,
idempotency behavior, and whether conversation metadata/request data is
returned to webhooks. Do not route through legacy pathway chat or enable a
widget as a substitute. No live text conversation has been created for this
integration work.

Once Bland confirms that contract, use authenticated NestJS endpoints only,
scope every operation by the authenticated user's owned case, use a stable
idempotency key per user message, persist user and assistant messages with
`channel: "text"`, and use a server timeout longer than the documented agent
turn limit.
