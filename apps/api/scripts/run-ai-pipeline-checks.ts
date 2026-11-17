import { NestFactory } from "@nestjs/core"
import { AppModule } from "../src/app.module"
import { PrismaService } from "../src/prisma/prisma.service"
import { AiPipelineTestService } from "../src/reports/ai-pipeline-test.service"
import type { AiPipelineTask } from "../src/reports/ai-pipeline-test.service"

process.loadEnvFile?.(".env")
const caseId = "2fb555de-712d-430a-86a6-491e1ec506d3"

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false })
  try {
    const prisma = app.get(PrismaService)
    const testService = app.get(AiPipelineTestService)
    const caseRecord = await prisma.case.findUnique({ where: { id: caseId }, select: { userId: true } })
    if (!caseRecord) throw new Error("The seeded sample case is missing")

    const rotation: string[] = []
    for (let index = 0; index < 3; index += 1) {
      const response = await testService.run({ caseId, task: "summary" }, caseRecord.userId)
      rotation.push(`${response.provider}/${response.keyUsed}`)
      console.log(JSON.stringify({ test: `A${index + 1}`, ok: response.provider === "groq", provider: response.provider, model: response.model, keyUsed: response.keyUsed, ms: response.ms }))
    }
    console.log(JSON.stringify({ test: "A-key-rotation", ok: new Set(rotation).size === 3 && rotation.every((key) => key.startsWith("groq/")), slots: rotation }))

    const requirements: Record<Exclude<AiPipelineTask, "image">, string[]> = {
      report: ["narrative", "summaryEnglish", "summaryHindi"],
      summary: ["summaryEnglish", "summaryHindi"],
      post: ["caption", "imagePrompt"],
    }
    for (const task of ["report", "summary", "post"] as const) {
      const response = await testService.run({ caseId, task }, caseRecord.userId)
      const value = isObject(response.result) ? response.result : {}
      const hasRequiredText = requirements[task].every((field) => typeof value[field] === "string" && value[field])
      const hasHashtags = task !== "post" || (Array.isArray(value.hashtags) && value.hashtags.length >= 3 && value.hashtags.length <= 5)
      const ok = hasRequiredText && hasHashtags
      console.log(JSON.stringify({ test: task, ok, provider: response.provider, model: response.model, keyUsed: response.keyUsed, ms: response.ms, fields: Object.keys(value) }))
    }

    const image = await testService.run({ caseId, task: "image" }, caseRecord.userId)
    const imageUrl = isObject(image.result) ? image.result.imageUrl : undefined
    console.log(JSON.stringify({ test: "image", ok: typeof imageUrl === "string" && imageUrl.startsWith("data:image/"), provider: image.provider, model: image.model, keyUsed: image.keyUsed, ms: image.ms }))

    const fallback = await testService.run({ caseId, task: "summary", forceFallback: true }, caseRecord.userId)
    console.log(JSON.stringify({ test: "fallback", ok: fallback.provider === "gemini", provider: fallback.provider, model: fallback.model, keyUsed: fallback.keyUsed, ms: fallback.ms }))
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "AI pipeline checks failed")
  process.exitCode = 1
})
