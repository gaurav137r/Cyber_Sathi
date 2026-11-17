import { Injectable } from "@nestjs/common"

export type AiPipelineTask =
  | "classification"
  | "extraction"
  | "report"
  | "image"
  | "summary"
  | "all"

@Injectable()
export class AiPipelineTestService {
  async run(_body?: unknown, _userId?: string): Promise<{ ok: boolean; task: AiPipelineTask; results: Record<string, unknown> }> {
    return { ok: false, task: "all", results: { error: "AI pipeline test service not configured in this environment." } }
  }
}
