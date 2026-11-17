import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import { randomUUID } from "node:crypto"
import { Case, CaseStatus, Prisma, type AuditLogEntry } from "@prisma/client"
import { interval, from, EMPTY, type Observable } from "rxjs"
import { concatMap, map, mergeMap, startWith } from "rxjs/operators"
import { PrismaService, withDbRetry } from "../prisma/prisma.service"
import { caseInputFields, evidenceCategories } from "./case-interactions.dto"

type RequestKind = "field" | "evidence" | "review"
type RequestStatus = "pending" | "submitted" | "cancelled" | "expired"
type CaseRequest = {
  requestId: string
  kind: RequestKind
  field?: (typeof caseInputFields)[number]
  category?: (typeof evidenceCategories)[number]
  displayPrompt?: string
  status: RequestStatus
  value?: string | null
  createdAt: string
  updatedAt: string
  revision: string
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function interactionState(fields: unknown) {
  return record(record(fields).__sathi)
}

function dateRevision(date: Date): string {
  return date.toISOString()
}

function eventType(action: string): string {
  const names: Record<string, string> = {
    SAATHI_INPUT_REQUESTED: "case.input_requested",
    SAATHI_INPUT_SUBMITTED: "case.input_submitted",
    SAATHI_EVIDENCE_REQUESTED: "case.evidence_requested",
    SAATHI_EVIDENCE_SUBMITTED: "evidence.uploaded",
    EVIDENCE_UPLOADED: "evidence.uploaded",
    EVIDENCE_QUEUED: "evidence.processing",
    EVIDENCE_PROCESSING: "evidence.processing",
    EVIDENCE_READY: "evidence.ready",
    EVIDENCE_FAILED: "evidence.failed",
    SAATHI_REVIEW_REQUESTED: "case.review_requested",
    CASE_REVIEW_CONFIRMED: "case.review_confirmed",
    SAATHI_HUMAN_SUPPORT_FLAGGED: "case.needs_human",
    CASE_UPDATED: "case.updated",
    INTERNAL_REPORT_COMPILED: "report.ready",
    SOCIAL_POST_CREATED: "social_post.ready",
  }
  return names[action] ?? "case.updated"
}

@Injectable()
export class CaseInteractionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getState(caseId: string, userId: string) {
    const found = await this.prisma.case.findFirst({
      where: { id: caseId, userId },
      include: {
        evidenceItems: {
          select: {
            id: true,
            type: true,
            uploadedAt: true,
            extractedEntities: true,
          },
          orderBy: { uploadedAt: "desc" },
        },
        auditLogs: { orderBy: [{ timestamp: "desc" }, { id: "desc" }], take: 100 },
        reportVersions: {
          select: { id: true, version: true, kind: true, generatedAt: true },
          orderBy: { generatedAt: "desc" },
          take: 1,
        },
      },
    })
    if (!found) throw new NotFoundException("Case was not found")

    const fields = record(found.structuredFields)
    const state = interactionState(fields)
    const requests = Array.isArray(state.requests)
      ? (state.requests as CaseRequest[])
      : []
    const statusByEvidence = new Map<string, string>()
    for (const event of found.auditLogs) {
      const metadata = record(event.metadata)
      const status =
        typeof metadata.status === "string"
          ? metadata.status
          : event.action === "EVIDENCE_READY"
            ? "ready"
            : event.action === "EVIDENCE_FAILED"
              ? "failed"
              : event.action === "EVIDENCE_UPLOADED"
                ? "uploaded"
                : undefined
      if (
        typeof metadata.evidenceId === "string" &&
        status &&
        !statusByEvidence.has(metadata.evidenceId)
      ) statusByEvidence.set(metadata.evidenceId, status)
    }
    const confirmedFields = record(fields.confirmedFields)
    const extractedCandidates = record(fields.extractedCandidates)
    const unresolvedConflicts = Object.entries(extractedCandidates).flatMap(
      ([field, candidate]) =>
        Object.prototype.hasOwnProperty.call(confirmedFields, field) &&
        String(confirmedFields[field]) !== String(candidate)
          ? [{ field, confirmed: confirmedFields[field], candidate }]
          : [],
    )
    const pendingRequests = requests.filter((request) => request.status === "pending")
    return {
      caseId: found.id,
      revision: dateRevision(found.updatedAt),
      status: found.status,
      category: found.category,
      fields: {
        confirmed: confirmedFields,
        extracted: extractedCandidates,
        userFields: Object.fromEntries(
          Object.entries(fields).filter(([key]) =>
            !["__sathi", "confirmedFields", "extractedCandidates"].includes(key),
          ),
        ),
      },
      pendingRequests,
      evidence: found.evidenceItems.map((item) => ({
        evidenceId: item.id,
        type: item.type,
        uploadedAt: item.uploadedAt,
        status: statusByEvidence.get(item.id) ?? "uploaded",
        extractedFields: record(item.extractedEntities),
      })),
      unresolvedConflicts,
      review: {
        confirmedRevision: state.confirmedRevision ?? null,
        currentRevisionConfirmed: state.confirmedRevision === dateRevision(found.updatedAt),
      },
      latestReport: found.reportVersions[0] ?? null,
      needsHuman: found.needsHuman,
      latestEventId: found.auditLogs[0]?.id ?? null,
      nextAction: pendingRequests[0]
        ? pendingRequests[0].kind === "field"
          ? "complete_requested_field"
          : pendingRequests[0].kind === "evidence"
            ? "upload_requested_evidence"
            : "review_case"
        : unresolvedConflicts.length
          ? "review_conflicting_evidence"
          : "continue_intake",
    }
  }

  requestField(
    caseId: string,
    userId: string,
    field: (typeof caseInputFields)[number],
    displayPrompt?: string,
  ) {
    return this.createRequest(caseId, userId, {
      kind: "field",
      field,
      displayPrompt: displayPrompt?.trim(),
      action: "SAATHI_INPUT_REQUESTED",
    })
  }

  requestEvidence(
    caseId: string,
    userId: string,
    category: (typeof evidenceCategories)[number],
  ) {
    return this.createRequest(caseId, userId, {
      kind: "evidence",
      category,
      action: "SAATHI_EVIDENCE_REQUESTED",
    })
  }

  requestReview(caseId: string, userId: string) {
    return this.createRequest(caseId, userId, {
      kind: "review",
      action: "SAATHI_REVIEW_REQUESTED",
    })
  }

  private async createRequest(
    caseId: string,
    userId: string,
    input: {
      kind: RequestKind
      field?: CaseRequest["field"]
      category?: CaseRequest["category"]
      displayPrompt?: string
      action: string
    },
  ) {
    const current = await this.ownedCase(caseId, userId)
    const fields = record(current.structuredFields)
    const prior = interactionState(fields)
    const requests = Array.isArray(prior.requests)
      ? (prior.requests as CaseRequest[])
      : []
    const existing = requests.find(
      (request) =>
        request.status === "pending" &&
        request.kind === input.kind &&
        request.field === input.field &&
        request.category === input.category,
    )
    if (existing) return { ...existing, revision: dateRevision(current.updatedAt) }

    const now = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1))
    const revision = dateRevision(now)
    const request: CaseRequest = {
      requestId: randomUUID(),
      kind: input.kind,
      ...(input.field ? { field: input.field } : {}),
      ...(input.category ? { category: input.category } : {}),
      ...(input.displayPrompt ? { displayPrompt: input.displayPrompt } : {}),
      status: "pending",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      revision,
    }
    const nextFields = {
      ...fields,
      __sathi: {
        ...prior,
        revision,
        requests: [...requests, request],
      },
    }
    await this.persistUpdate(current, userId, nextFields, input.action, {
      requestId: request.requestId,
      kind: request.kind,
      field: request.field,
      category: request.category,
      revision,
    }, now)
    return request
  }

  async submitRequest(
    caseId: string,
    requestId: string,
    userId: string,
    expectedRevision: string,
    value: string | undefined,
    omit: boolean,
  ) {
    const current = await this.ownedCase(caseId, userId)
    const currentRevision = dateRevision(current.updatedAt)
    if (expectedRevision !== currentRevision)
      throw new ConflictException({
        message: "The case changed. Refresh its state and try again.",
        currentRevision,
      })
    const fields = record(current.structuredFields)
    const prior = interactionState(fields)
    const requests = Array.isArray(prior.requests)
      ? (prior.requests as CaseRequest[])
      : []
    const requestIndex = requests.findIndex(
      (request) => request.requestId === requestId && request.status === "pending",
    )
    if (requestIndex < 0) throw new NotFoundException("Pending request was not found")
    const request = requests[requestIndex]
    if (request.kind !== "field" || !request.field)
      throw new BadRequestException("This request does not accept a typed value")
    if (!omit && (typeof value !== "string" || !value.trim()))
      throw new BadRequestException("Provide a value or choose to omit it")

    const cleanValue = omit ? null : this.validateField(request.field, value!.trim())
    const now = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1))
    const revision = dateRevision(now)
    const updatedRequest: CaseRequest = {
      ...request,
      status: "submitted",
      value: cleanValue,
      updatedAt: now.toISOString(),
      revision,
    }
    requests[requestIndex] = updatedRequest
    const confirmedFields = record(fields.confirmedFields)
    const nextConfirmed = { ...confirmedFields, [request.field]: cleanValue }
    const nextFields = {
      ...fields,
      [request.field]: cleanValue,
      confirmedFields: nextConfirmed,
      __sathi: {
        ...prior,
        revision,
        confirmedRevision: null,
        requests,
      },
    }
    await this.persistUpdate(current, userId, nextFields, "SAATHI_INPUT_SUBMITTED", {
      requestId,
      field: request.field,
      omitted: omit,
      revision,
    }, now)
    return { request: updatedRequest, revision, saved: true }
  }

  async confirmReview(caseId: string, userId: string, expectedRevision: string) {
    const current = await this.ownedCase(caseId, userId)
    const revision = dateRevision(current.updatedAt)
    if (revision !== expectedRevision)
      throw new ConflictException({
        message: "The case changed. Review the updated values before confirming.",
        currentRevision: revision,
      })
    const fields = record(current.structuredFields)
    const prior = interactionState(fields)
    if (
      Array.isArray(prior.requests) &&
      prior.requests.some(
        (request) => record(request).status === "pending" && record(request).kind !== "review",
      )
    )
      throw new ConflictException("Complete or cancel pending requests before confirming.")
    const requests = Array.isArray(prior.requests)
      ? (prior.requests as CaseRequest[])
      : []
    const reviewRequest = requests.find(
      (request) => request.kind === "review" && request.status === "pending",
    )
    const now = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1))
    const confirmedRevision = dateRevision(now)
    const updatedRequests = reviewRequest
      ? requests.map((request) =>
          request.requestId === reviewRequest.requestId
            ? { ...request, status: "submitted" as const, updatedAt: now.toISOString() }
            : request,
        )
      : requests
    const nextFields = {
      ...fields,
      __sathi: {
        ...prior,
        revision: confirmedRevision,
        confirmedRevision,
        requests: updatedRequests,
      },
    }
    await this.persistUpdate(current, userId, nextFields, "CASE_REVIEW_CONFIRMED", {
      revision: confirmedRevision,
    }, now)
    // Update case status to REVIEWED after review confirmation
    await this.prisma.case.update({
      where: { id: caseId, userId },
      data: { status: CaseStatus.REVIEWED },
    })
    return { caseId, confirmedRevision, status: "confirmed", caseStatus: CaseStatus.REVIEWED }
  }

  async flagHumanSupport(caseId: string, userId: string) {
    const current = await this.ownedCase(caseId, userId)
    if (current.needsHuman) return { flagSaved: true, alreadyFlagged: true }
    const updatedAt = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1))
    await withDbRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const updated = await tx.case.updateMany({
          where: { id: caseId, userId, updatedAt: current.updatedAt },
          data: { needsHuman: true, updatedAt },
        })
        if (updated.count !== 1)
          throw new ConflictException("The case changed. Refresh and try again.")
        await tx.auditLogEntry.create({
          data: {
            caseId,
            actorUserId: userId,
            action: "SAATHI_HUMAN_SUPPORT_FLAGGED",
            metadata: { flagSaved: true },
            timestamp: updatedAt,
          },
        })
      }, { timeout: 20_000 }),
    )
    return { flagSaved: true, alreadyFlagged: false }
  }

  streamEvents(
    caseId: string,
    userId: string,
    lastEventId?: string,
  ): Observable<{
    id: string
    type: string
    data: Record<string, unknown>
  }> {
    let cursor = lastEventId
    return interval(5_000).pipe(
      startWith(0),
      concatMap(() => from(this.listEvents(caseId, userId, cursor))),
      mergeMap((events) => {
        if (!events.length) return EMPTY
        return from(events).pipe(
          map((event) => {
            cursor = event.id
            return {
              id: event.id,
              type: eventType(event.action),
              data: {
                eventId: event.id,
                caseId,
                type: eventType(event.action),
                createdAt: event.timestamp,
                data: event.metadata,
              },
            }
          }),
        )
      }),
    )
  }

  private async listEvents(
    caseId: string,
    userId: string,
    cursor?: string,
  ): Promise<AuditLogEntry[]> {
    await this.ownedCase(caseId, userId)
    let cursorEntry: AuditLogEntry | null = null
    if (cursor) {
      cursorEntry = await this.prisma.auditLogEntry.findFirst({
        where: { id: cursor, caseId },
      })
      if (!cursorEntry) return []
    }
    const events = await this.prisma.auditLogEntry.findMany({
      where: {
        caseId,
        ...(cursorEntry ? { timestamp: { gte: cursorEntry.timestamp } } : {}),
      },
      orderBy: [{ timestamp: "asc" }, { id: "asc" }],
      take: 100,
    })
    return cursorEntry
      ? events.filter(
          (event) =>
            event.timestamp > cursorEntry!.timestamp ||
            (event.timestamp.getTime() === cursorEntry!.timestamp.getTime() &&
              event.id > cursorEntry!.id),
        )
      : events.slice(-50)
  }

  private async ownedCase(caseId: string, userId: string) {
    const found = await withDbRetry(() =>
      this.prisma.case.findFirst({ where: { id: caseId, userId } }),
    )
    if (!found) throw new NotFoundException("Case was not found")
    return found
  }

  private async persistUpdate(
    current: Case,
    userId: string,
    structuredFields: Record<string, unknown>,
    action: string,
    metadata: Record<string, unknown>,
    updatedAt: Date,
  ) {
    await withDbRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const saved = await tx.case.updateMany({
          where: { id: current.id, userId, updatedAt: current.updatedAt },
          data: {
            structuredFields: structuredFields as Prisma.InputJsonValue,
            updatedAt,
          },
        })
        if (saved.count !== 1)
          throw new ConflictException("The case changed. Refresh and try again.")
        await tx.auditLogEntry.create({
          data: {
            caseId: current.id,
            actorUserId: userId,
            action,
            metadata: metadata as Prisma.InputJsonValue,
            timestamp: updatedAt,
          },
        })
      }, { timeout: 20_000 }),
    )
  }

  private validateField(
    field: (typeof caseInputFields)[number],
    value: string,
  ): string {
    const limits: Record<(typeof caseInputFields)[number], number> = {
      victim_phone: 32,
      suspect_phone: 32,
      caller_name: 120,
      sms_content: 8_000,
      transaction_id: 160,
      amount: 32,
      currency: 8,
      incident_datetime: 80,
      bank_or_app: 120,
      provisional_fraud_category: 100,
      description: 8_000,
    }
    if (value.length > limits[field])
      throw new BadRequestException(`${field} is too long`)
    if (field.endsWith("_phone") && !/^\+?[0-9][0-9\s()-]{5,24}$/.test(value))
      throw new BadRequestException("Enter a phone number using digits and an optional country code")
    if (field === "amount" && !/^\d+(?:\.\d{1,2})?$/.test(value))
      throw new BadRequestException("Enter the amount as a number")
    if (field === "incident_datetime" && Number.isNaN(Date.parse(value)))
      throw new BadRequestException("Enter a valid incident date or time")
    return value
  }
}
