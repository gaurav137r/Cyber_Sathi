import { useState } from "react"
import { runAiPipelineTest, type AiPipelineResult, type AiPipelineTask } from "../lib/ai-pipeline"

const tasks: Array<{ id: AiPipelineTask; label: string }> = [
  { id: "report", label: "Report" },
  { id: "summary", label: "Bilingual summary" },
  { id: "post", label: "Social post" },
  { id: "image", label: "Image" },
]

export function AiPipelineTestPanel() {
  const [caseId, setCaseId] = useState("2fb555de-712d-430a-86a6-491e1ec506d3")
  const [forceFallback, setForceFallback] = useState(false)
  const [loading, setLoading] = useState<AiPipelineTask | null>(null)
  const [result, setResult] = useState<AiPipelineResult | null>(null)
  const [error, setError] = useState("")

  if (!import.meta.env.DEV) return null

  const run = async (task: AiPipelineTask) => {
    setLoading(task)
    setError("")
    try {
      setResult(await runAiPipelineTest(caseId.trim(), task, forceFallback))
    } catch (cause) {
      setResult(null)
      setError(cause instanceof Error ? cause.message : "AI pipeline request failed")
    } finally {
      setLoading(null)
    }
  }

  const imageUrl = result?.task === "image" && typeof result.result === "object" && result.result !== null
    ? (result.result as { imageUrl?: string }).imageUrl
    : undefined
  const printableResult = result
    ? JSON.stringify(result, (_key, value) => typeof value === "string" && value.startsWith("data:image/")
      ? `[image data omitted; ${value.length} characters]`
      : value, 2)
    : ""

  return (
    <section style={{ margin: 16, padding: 16, border: "1px solid #d6e2df", borderRadius: 14, background: "#fff", color: "#16211f" }}>
      <h2 style={{ margin: "0 0 8px", color: "#0f4c4c", fontSize: 17 }}>AI pipeline test</h2>
      <p style={{ margin: "0 0 12px", color: "#5b6b68", fontSize: 12 }}>Development only. Responses show provider, model, key slot label and elapsed time; API keys are never returned.</p>
      <label style={{ display: "block", marginBottom: 8, fontSize: 12, fontWeight: 700 }}>
        Case ID
        <input value={caseId} onChange={(event) => setCaseId(event.target.value)} style={{ display: "block", width: "100%", boxSizing: "border-box", marginTop: 5, padding: 9, border: "1px solid #cbd8d5", borderRadius: 8 }} />
      </label>
      <label style={{ display: "flex", gap: 7, alignItems: "center", marginBottom: 12, fontSize: 12 }}>
        <input type="checkbox" checked={forceFallback} onChange={(event) => setForceFallback(event.target.checked)} />
        Run on fallback provider
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {tasks.map((task) => (
          <button key={task.id} type="button" disabled={!caseId.trim() || loading !== null} onClick={() => void run(task.id)} style={{ padding: "8px 12px", border: 0, borderRadius: 18, background: "#146b66", color: "white", cursor: "pointer", opacity: loading !== null ? 0.6 : 1 }}>
            {loading === task.id ? "Running…" : task.label}
          </button>
        ))}
      </div>
      {error && <p role="alert" style={{ color: "#a12820", fontSize: 12 }}>{error}</p>}
      {result && <>
        <p role="status" style={{ marginBottom: 8, color: "#146b66", fontSize: 12 }}>{result.provider} · {result.model} · {result.keyUsed} · {result.ms} ms</p>
        {imageUrl && <img src={imageUrl} alt="Generated awareness illustration" style={{ display: "block", maxWidth: "100%", maxHeight: 280, marginBottom: 10, borderRadius: 8 }} />}
        <pre style={{ maxHeight: 360, overflow: "auto", margin: 0, padding: 12, borderRadius: 8, background: "#f4f5f3", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 11 }}>{printableResult}</pre>
      </>}
    </section>
  )
}
