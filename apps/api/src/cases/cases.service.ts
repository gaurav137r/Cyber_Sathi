import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import type { AppEnv } from "../config/env.schema";
import { PrismaService } from "../prisma/prisma.service";
import { CaseStateMachine } from "./case-state-machine";
import {
  CreateCaseDto,
  TransitionCaseDto,
  UpdateCaseDto,
  asJson,
} from "./dto/case.dto";

@Injectable()
export class CasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  private actorId() {
    return this.config.get("STUB_USER_ID", { infer: true });
  }

  async create(dto: CreateCaseDto) {
    const userId = this.actorId();
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.case.create({
        data: {
          userId,
          rawTranscript: dto.rawTranscript,
          detectedLanguage: dto.detectedLanguage,
          structuredFields: asJson(dto.structuredFields),
        },
      });
      await tx.auditLogEntry.create({
        data: {
          caseId: created.id,
          actorUserId: userId,
          action: "CASE_CREATED",
          metadata: { status: created.status },
        },
      });
      return created;
    });
  }

  async list() {
    return this.prisma.case.findMany({
      where: { userId: this.actorId() },
      orderBy: { createdAt: "desc" },
    });
  }

  async get(id: string) {
    const found = await this.prisma.case.findFirst({
      where: { id, userId: this.actorId() },
      include: { auditLogs: { orderBy: { timestamp: "asc" } } },
    });
    if (!found) {
      throw new NotFoundException(`Case ${id} not found`);
    }
    return found;
  }

  async update(id: string, dto: UpdateCaseDto) {
    await this.get(id);
    const userId = this.actorId();
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.case.findUniqueOrThrow({ where: { id } });
      const mergedFields =
        dto.structuredFields === undefined
          ? undefined
          : {
              ...asObject(existing.structuredFields),
              ...dto.structuredFields,
            };

      const updated = await tx.case.update({
        where: { id },
        data: {
          rawTranscript: dto.rawTranscript,
          detectedLanguage: dto.detectedLanguage,
          category: dto.category,
          categoryConfidence: dto.categoryConfidence,
          filingDestination: dto.filingDestination,
          trackingNumber: dto.trackingNumber,
          structuredFields:
            mergedFields === undefined
              ? undefined
              : (mergedFields as Prisma.InputJsonValue),
        },
      });
      await tx.auditLogEntry.create({
        data: {
          caseId: id,
          actorUserId: userId,
          action: "CASE_UPDATED",
          metadata: { fields: Object.keys(dto) },
        },
      });
      return updated;
    });
  }

  async transition(id: string, dto: TransitionCaseDto) {
    const current = await this.get(id);
    const toStatus = dto.toStatus;
    CaseStateMachine.assertTransition(current.status, toStatus);
    const userId = this.actorId();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.case.update({
        where: { id },
        data: { status: toStatus },
      });
      await tx.auditLogEntry.create({
        data: {
          caseId: id,
          actorUserId: userId,
          action: "CASE_TRANSITIONED",
          metadata: { from: current.status, to: toStatus },
        },
      });
      return updated;
    });
  }

  async touchUpdatedAt(id: string) {
    await this.get(id);
    return this.prisma.case.update({
      where: { id },
      data: { updatedAt: new Date() },
    });
  }
}

function asObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
