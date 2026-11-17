import { NestFactory } from "@nestjs/core"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { EvidenceType } from "@prisma/client"
import { AppModule } from "../src/app.module"
import { PrismaService } from "../src/prisma/prisma.service"
import { EvidenceService } from "../src/evidence/evidence.service"

process.loadEnvFile?.(resolve(__dirname, "../.env"))

type Img = { path: string; name: string; mimetype: string }
const images: Img[] = [
  { path: "../../test_evidence/investment-fraud", name: "investment-fraud.webp", mimetype: "image/webp" },
  { path: "../../test_evidence/payment_SS.webp", name: "payment_SS.webp", mimetype: "image/webp" },
  { path: "../../test_evidence/store_purchase_receipt.webp", name: "store_purchase_receipt.webp", mimetype: "image/webp" },
]

function out(obj: unknown) {
  return JSON.stringify(obj, null, 2)
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] })
  try {
    const prisma = app.get(PrismaService)
    const evidence = app.get(EvidenceService)
    const userId = process.env.STUB_USER_ID || "00000000-0000-4000-8000-000000000001"

    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, preferredLanguage: "en" },
    })

    const createdCase = await prisma.case.create({
      data: {
        userId,
        status: "PROCESSING",
        category: "INVESTMENT_TRADING_FRAUD",
        detectedLanguage: "en",
        rawTranscript: "Test run: upload test_evidence images for AI extraction.",
        structuredFields: {},
        canonicalEntities: {},
      },
    })
    console.log(JSON.stringify({ caseId: createdCase.id, userId }))

    for (const img of images) {
      const abs = resolve(__dirname, img.path)
      const buffer = readFileSync(abs)
      const file = { buffer, mimetype: img.mimetype, size: buffer.length }
      console.log(`\n=== Uploading ${img.name} (${buffer.length} bytes) ===`)
      let item: any
      try {
        item = await evidence.upload(createdCase.id, file as any, { id: userId } as any, EvidenceType.IMAGE)
        console.log(JSON.stringify({ uploaded: { id: item.id, storageKey: item.storageKey, processingStatus: item.processingStatus } }))
      } catch (e: any) {
        console.error(JSON.stringify({ uploadError: img.name, message: e?.message, stack: e?.stack?.split("\n")[0] }))
        continue
      }

      console.log(`--- Processing ${img.name} via AI ---`)
      try {
        await evidence.processQueuedEvidence(createdCase.id, item.id, userId)
      } catch (e: any) {
        console.error(JSON.stringify({ processError: img.name, message: e?.message, response: e?.response }))
      }

      const updated = await prisma.evidenceItem.findUnique({ where: { id: item.id } })
      console.log(out({
        evidenceId: item.id,
        file: img.name,
        extractedText: updated?.extractedText ?? null,
        extractedEntities: updated?.extractedEntities ?? null,
      }))
    }

    const finalCase = await prisma.case.findUnique({
      where: { id: createdCase.id },
      include: { evidenceItems: { select: { id: true, storageKey: true, extractedEntities: true } } },
    })
    console.log("\n=== CASE CANONICAL / STRUCTURED ===")
    console.log(out({
      caseId: finalCase?.id,
      category: finalCase?.category,
      canonicalEntities: finalCase?.canonicalEntities,
      structuredFields: finalCase?.structuredFields,
      evidence: finalCase?.evidenceItems,
    }))

    const expectedPath = resolve(__dirname, "../../test_evidence/test-Investment-fraud.json")
    try {
      const expected = JSON.parse(readFileSync(expectedPath, "utf8"))
      console.log("\n=== EXPECTED (test-Investment-fraud.json summary) ===")
      console.log(out({
        fraud_type: expected?.complaint_meta?.fraud_type,
        amount_lost: expected?.complaint_meta?.amount_lost,
        transactions: expected?.financial_details?.transactions?.length,
        suspect_upi: expected?.suspect_details?.upi_id,
        suspect_mobile: expected?.suspect_details?.mobile_number,
        mode: expected?.financial_details?.mode_of_transfer,
      }))
    } catch {}
  } finally {
    await app.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
