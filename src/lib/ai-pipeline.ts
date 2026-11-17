import { apiRequest } from "./api"

export type AiPipelineTask = "report" | "summary" | "post" | "image"

export interface AiPipelineResult {
  task: AiPipelineTask
  result: unknown
  provider: string
  model: string
  keyUsed: string
  ms: number
}

export function runAiPipelineTest(caseId: string, task: AiPipelineTask, forceFallback = false) {
  return apiRequest<AiPipelineResult>("/test/ai-pipeline", {
    method: "POST",
    body: JSON.stringify({ caseId, task, forceFallback }),
  })
}
