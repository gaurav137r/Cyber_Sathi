import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { Prisma, PrismaClient } from "@prisma/client"

process.loadEnvFile?.(".env")

const caseId = "2fb555de-712d-430a-86a6-491e1ec506d3"
const bucket = process.env.SUPABASE_EVIDENCE_BUCKET ?? "evidence"
const storageKey = `${caseId}/documents/test-Investment-fraud.json`
const filePath = resolve(process.cwd(), "../../test_evidence/test-Investment-fraud.json")
const prisma = new PrismaClient()

async function uploadPrivateEvidence(bytes: Buffer) {
  const base = process.env.SUPABASE_URL?.replace(/\/+$/, "")
  const secret = process.env.SUPABASE_SECRET_KEY
  if (!base || !secret) throw new Error("Supabase private storage configuration is missing")
  const encodedKey = storageKey.split("/").map(encodeURIComponent).join("/")
  const response = await fetch(`${base}/storage/v1/object/${bucket}/${encodedKey}`, {
    method: "POST",
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      "x-upsert": "true",
    },
    body: new Uint8Array(bytes),
  })
  if (!response.ok) throw new Error(`Private evidence upload failed with HTTP ${response.status}`)
}

async function main() {
  const bytes = await readFile(filePath)
  const json = JSON.parse(bytes.toString("utf8")) as Record<string, any>
  const owner = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } })
  if (!owner) throw new Error("No Cyber Sathi user exists; sign in once before seeding the sample case")
  const prior = await prisma.case.findUnique({ where: { id: caseId }, include: { evidenceItems: true } })
  if (prior) {
    if (prior.userId !== owner.id) throw new Error("The deterministic sample case ID belongs to a different user")
    if (prior.evidenceItems.some((item) => item.storageKey === storageKey)) {
      console.log(JSON.stringify({ caseId, status: prior.status, evidence: "already seeded" }))
      return
    }
  }

  await uploadPrivateEvidence(bytes)
  const revision = new Date()
  const complaint = json.complaint_meta ?? {}
  const incident = json.incident_details ?? {}
  const finances = json.financial_details ?? {}
  const structuredFields = {
    ...json,
    amount: finances.total_fraud_amount ?? complaint.amount_lost ?? null,
    incidentDate: incident.date_of_incident ?? complaint.incident_start_date ?? null,
    bankOrApp: finances.upi_app_used ?? finances.bank_name ?? null,
    description: incident.detailed_description ?? complaint.short_description ?? "",
    __sathi: { confirmedRevision: revision.toISOString() },
  } as Prisma.InputJsonValue

  try {
    await prisma.$transaction(async (tx) => {
      if (!prior) {
        await tx.case.create({
          data: {
            id: caseId,
            userId: owner.id,
            status: "REVIEWED",
            category: incident.category ?? complaint.fraud_type ?? "Online Financial Fraud",
            categoryConfidence: 1,
            classificationExplanation: "Test case seeded from the local sample JSON.",
            clarificationRequired: false,
            detectedLanguage: "en",
            rawTranscript: incident.detailed_description ?? complaint.short_description ?? "",
            canonicalTranscript: incident.detailed_description ?? complaint.short_description ?? "",
            structuredFields,
            canonicalEntities: {},
            updatedAt: revision,
          },
        })
      }
      await tx.evidenceItem.create({
        data: {
          id: randomUUID(),
          caseId,
          type: "DOCUMENT",
          storageKey,
        },
      })
    })
  } catch (error) {
    await fetch(`${process.env.SUPABASE_URL!.replace(/\/+$/, "")}/storage/v1/object/${bucket}`, {
      method: "DELETE",
      headers: {
        apikey: process.env.SUPABASE_SECRET_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY!}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefixes: [storageKey] }),
    }).catch(() => undefined)
    throw error
  }
  console.log(JSON.stringify({ caseId, status: "REVIEWED", evidence: "DOCUMENT seeded" }))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Seed failed")
  process.exitCode = 1
}).finally(async () => prisma.$disconnect())
