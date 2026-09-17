import { CaseStatus } from "@prisma/client";
import { UnprocessableEntityException } from "@nestjs/common";

const ALLOWED: Record<CaseStatus, CaseStatus[]> = {
  [CaseStatus.DRAFT]: [CaseStatus.PROCESSING, CaseStatus.ARCHIVED],
  [CaseStatus.PROCESSING]: [CaseStatus.CLASSIFIED, CaseStatus.ARCHIVED],
  [CaseStatus.CLASSIFIED]: [CaseStatus.REVIEWED, CaseStatus.ARCHIVED],
  [CaseStatus.REVIEWED]: [CaseStatus.FILED, CaseStatus.ARCHIVED],
  [CaseStatus.FILED]: [CaseStatus.RESOLVED, CaseStatus.ARCHIVED],
  [CaseStatus.RESOLVED]: [CaseStatus.ARCHIVED],
  [CaseStatus.ARCHIVED]: [],
};

export class CaseStateMachine {
  static assertTransition(from: CaseStatus, to: CaseStatus) {
    if (from === to) {
      throw new UnprocessableEntityException(`Case is already ${from}`);
    }
    const allowed = ALLOWED[from];
    if (!allowed.includes(to)) {
      throw new UnprocessableEntityException(
        `Invalid transition ${from} → ${to}. Allowed: ${allowed.join(", ") || "(none)"}`,
      );
    }
  }
}
