import { useEffect, useMemo, useRef, useState } from "react"
import type { CaseRecord } from "../lib/cases"
import { compileCaseReport } from "../lib/cases"
import { confirmCaseReview, getCaseState, type CaseState } from "../lib/case-interactions"
import { apiRequest } from "../lib/api"
import { uploadCaseEvidence } from "../lib/evidence"
import {
  generateReportSummary,
  generateSocialDraft,
  getReportCenter,
  type ReportCenterData,
  type ReportLanguage,
  type ReportSocialPlatform,
} from "../lib/report-center"

type JourneyStep = "evidence" | "report" | "share"
type CompiledReport = { id: string; version: number; content: Record<string, unknown> }

const platforms: Array<{ id: ReportSocialPlatform; name: string; url: string }> = [
  { id: "linkedin", name: "LinkedIn", url: "https://www.linkedin.com/feed/" },
  { id: "instagram", name: "Instagram", url: "https://www.instagram.com/" },
  { id: "facebook", name: "Facebook", url: "https://www.facebook.com/" },
  { id: "twitter", name: "X / Twitter", url: "https://x.com/compose/post" },
]

export function CaseJourney({ caseRecord, onBack, preferredLanguage }: {
  caseRecord: CaseRecord
  onBack: () => void
  preferredLanguage: "en" | "hi" | "bn"
}) {
  const [step, setStep] = useState<JourneyStep>("evidence")
  const [language, setLanguage] = useState<ReportLanguage>(preferredLanguage === "hi" ? "hi" : "en")
  const [caseState, setCaseState] = useState<CaseState | null>(null)
  const [center, setCenter] = useState<ReportCenterData | null>(null)
  const [report, setReport] = useState<CompiledReport | null>(null)
  const [summary, setSummary] = useState("")
  const [selectedPlatform, setSelectedPlatform] = useState<ReportSocialPlatform>("linkedin")
  const [draft, setDraft] = useState<{ caption: string; hashtags: unknown } | null>(null)
  const [busy, setBusy] = useState<"upload" | "report" | "summary" | "post" | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const fileInput = useRef<HTMLInputElement>(null)

  const refresh = async () => {
    const [state, reportCenter] = await Promise.all([
      getCaseState(caseRecord.id),
      getReportCenter(caseRecord.id),
    ])
    setCaseState(state)
    setCenter(reportCenter)
  }

  useEffect(() => {
    let live = true
    void Promise.all([getCaseState(caseRecord.id), getReportCenter(caseRecord.id)])
      .then(([state, reportCenter]) => {
        if (!live) return
        setCaseState(state)
        setCenter(reportCenter)
      })
      .catch((cause: unknown) => {
        if (live) setError(cause instanceof Error ? cause.message : "Could not load this case workspace.")
      })
    return () => { live = false }
  }, [caseRecord.id])

  const currentReport = useMemo(() => report ?? undefined, [report])
  const narrative = typeof currentReport?.content.narrative === "string"
    ? currentReport.content.narrative
    : caseRecord.complaintNarrative || caseRecord.summary
  const evidenceCount = caseState?.evidence.length ?? 0
  const reportReady = Boolean(report || center?.report)
  const generatedSummary = summary || (language === "hi" ? center?.report?.summaryHindi : center?.report?.summaryEnglish) || ""

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy("upload")
    setError("")
    setNotice("")
    try {
      for (const file of Array.from(files)) {
        const uploaded = await uploadCaseEvidence(caseRecord.id, file)
        await apiRequest(
          `/cases/${encodeURIComponent(caseRecord.id)}/evidence/process?evidenceId=${encodeURIComponent(uploaded.id)}`,
          { method: "POST" },
        )
      }
      await refresh()
      setNotice("Evidence uploaded. Processing has started; you can continue while it finishes.")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Evidence upload failed. Please try again.")
    } finally {
      setBusy(null)
      if (fileInput.current) fileInput.current.value = ""
    }
  }

  const buildReportAndSummary = async () => {
    setBusy("report")
    setError("")
    setNotice("")
    try {
      const state = await getCaseState(caseRecord.id)
      let revision = state.revision
      if (!state.review.currentRevisionConfirmed) {
        const confirmation = await confirmCaseReview(caseRecord.id, revision)
        revision = confirmation.confirmedRevision
      }
      const compiled = await compileCaseReport(caseRecord.id, revision)
      setReport(compiled)
      setBusy("summary")
      const publicSummary = await generateReportSummary(caseRecord.id, language)
      setSummary(publicSummary.summary)
      await refresh()
      setStep("report")
      setNotice("Your report and private, redacted summary are ready.")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not generate the report. Please retry.")
    } finally {
      setBusy(null)
    }
  }

  const createDraft = async () => {
    setBusy("post")
    setError("")
    setNotice("")
    try {
      const created = await generateSocialDraft(caseRecord.id, selectedPlatform, language)
      setDraft({ caption: created.caption, hashtags: created.hashtags })
      await refresh()
      setNotice("Draft ready. Review it before sharing; Cyber Sathi does not publish for you.")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the social post draft.")
    } finally {
      setBusy(null)
    }
  }

  const copyDraft = async () => {
    if (!draft) return
    const tags = Array.isArray(draft.hashtags) ? draft.hashtags.join(" ") : ""
    const text = `${draft.caption}${tags ? `\n\n${tags}` : ""}`
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard is unavailable")
      await navigator.clipboard.writeText(text)
      setNotice("Post copied. Open your social app and paste it into a new post.")
    } catch {
      setNotice("Copy is unavailable in this browser. Select the draft text and copy it manually.")
    }
  }

  const shareDraft = async () => {
    if (!draft) return
    const tags = Array.isArray(draft.hashtags) ? draft.hashtags.join(" ") : ""
    const text = `${draft.caption}${tags ? `\n\n${tags}` : ""}`
    if (navigator.share) {
      try { await navigator.share({ text }); return } catch { /* User cancelled or share is unavailable. */ }
    }
    await copyDraft()
  }

  const printReport = () => window.print()

  return (
    <main className="journey-shell">
      <header className="journey-header">
        <button className="journey-back" onClick={onBack} aria-label="Back to cases">‹</button>
        <div className="journey-heading">
          <span className="journey-eyebrow">CASE WORKSPACE</span>
          <h1>{caseRecord.category || "Cyber fraud case"}</h1>
          <p>Case {caseRecord.trackingNumber || caseRecord.id}</p>
        </div>
        <span className="journey-status">{caseRecord.status.replace(/_/g, " ")}</span>
      </header>

      <nav className="journey-steps" aria-label="Case progress">
        {([ ["evidence", "1", "Evidence"], ["report", "2", "Report"], ["share", "3", "Awareness post"] ] as const).map(([id, number, label], index) => (
          <button key={id} className={`journey-step ${step === id ? "active" : ""} ${index < ["evidence", "report", "share"].indexOf(step) ? "complete" : ""}`} onClick={() => {
            if (id === "evidence" || reportReady) setStep(id)
          }} disabled={id !== "evidence" && !reportReady}>
            <span className="journey-step-number">{index < ["evidence", "report", "share"].indexOf(step) ? "✓" : number}</span>
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <section className="journey-content">
        {error && <div className="journey-alert error" role="alert">{error}</div>}
        {notice && <div className="journey-alert success" role="status">{notice}</div>}

        {step === "evidence" && <>
          <div className="journey-intro">
            <span className="journey-icon">📎</span>
            <div><h2>Add supporting evidence</h2><p>Upload screenshots, audio, video, PDFs, or JSON files. Your files stay in your private case.</p></div>
          </div>
          <div className="journey-card upload-card">
            <input ref={fileInput} type="file" multiple accept="image/*,audio/*,video/*,.pdf,.json,.doc,.docx" onChange={(event) => void uploadFiles(event.target.files)} hidden />
            <button className="journey-primary" disabled={busy === "upload"} onClick={() => fileInput.current?.click()}>
              {busy === "upload" ? "Uploading and starting analysis…" : "Choose evidence files"}
            </button>
            <p className="journey-hint">Up to 25 MB per file. You can also continue without attaching evidence.</p>
          </div>
          <div className="journey-card">
            <div className="journey-card-title"><h3>Evidence on this case</h3><span>{evidenceCount}</span></div>
            {caseState ? caseState.evidence.length ? <ul className="evidence-list">{caseState.evidence.map((item) => (
              <li key={item.evidenceId}><span className="evidence-file-icon">{item.type === "AUDIO" ? "🎧" : item.type === "DOCUMENT" ? "📄" : "🖼️"}</span><span><strong>{item.type.toLowerCase()}</strong><small>Added {new Date(item.uploadedAt).toLocaleString()}</small></span><span className={`evidence-state ${item.status}`}>{item.status}</span></li>
            ))}</ul> : <p className="journey-empty">No files attached yet. Screenshots or transaction documents can help support your report.</p> : <p className="journey-empty">Loading evidence…</p>}
          </div>
          <div className="journey-actions"><button className="journey-text-button" onClick={() => setStep("report")}>Skip for now</button><button className="journey-primary" onClick={() => setStep("report")}>Continue to report <span>→</span></button></div>
        </>}

        {step === "report" && <>
          <div className="journey-intro"><span className="journey-icon">📝</span><div><h2>Prepare your report</h2><p>Generate a factual case report and a share-safe summary in your preferred language.</p></div></div>
          <div className="journey-card report-preview">
            <span className="journey-eyebrow">CASE DETAILS</span><h3>{caseRecord.category || "Incident report"}</h3>
            {caseRecord.amount && <p className="report-loss">Reported loss: {caseRecord.amount}</p>}
            <p>{narrative || "No incident narrative was saved for this case."}</p>
            <div className="report-evidence-note">{evidenceCount} evidence {evidenceCount === 1 ? "item" : "items"} attached</div>
          </div>
          <div className="journey-card">
            <label className="journey-label" htmlFor="report-language">Summary language</label>
            <select id="report-language" className="journey-select" value={language} onChange={(event) => setLanguage(event.target.value as ReportLanguage)}>
              <option value="en">English</option><option value="hi">हिंदी (Hindi)</option>
            </select>
            <p className="journey-hint">The social awareness draft will use this same language.</p>
          </div>
          {generatedSummary && <div className="journey-card summary-card"><span className="journey-eyebrow">{language === "hi" ? "हिंदी सारांश" : "REDACTED SUMMARY"}</span><p>{generatedSummary}</p></div>}
          <div className="journey-actions"><button className="journey-text-button" onClick={() => setStep("evidence")}>← Evidence</button><div className="journey-actions-right">
            {reportReady && <button className="journey-secondary" onClick={printReport}>Save / print PDF</button>}
            <button className="journey-primary" disabled={busy !== null} onClick={() => void buildReportAndSummary()}>{busy === "report" ? "Preparing report…" : busy === "summary" ? "Writing summary…" : reportReady ? "Refresh report" : "Generate report"}</button>
          </div></div>
          {reportReady && <div className="journey-actions"><span className="journey-hint">Review the generated report before saving it as PDF.</span><button className="journey-primary" onClick={() => setStep("share")}>Create awareness post →</button></div>}
        </>}

        {step === "share" && <>
          <div className="journey-intro"><span className="journey-icon">📣</span><div><h2>Share an awareness post</h2><p>Create a redacted prevention message based on your report. Your private case details are not included.</p></div></div>
          <div className="journey-card">
            <label className="journey-label" htmlFor="social-platform">Choose a platform</label>
            <div className="platform-grid">{platforms.map((platform) => <button key={platform.id} className={`platform-choice ${selectedPlatform === platform.id ? "selected" : ""}`} onClick={() => { setSelectedPlatform(platform.id); setDraft(null) }}><span>{platform.name}</span>{selectedPlatform === platform.id && <span aria-hidden="true">✓</span>}</button>)}</div>
            <button className="journey-primary full-width" disabled={busy === "post"} onClick={() => void createDraft()}>{busy === "post" ? "Creating a safe draft…" : draft ? "Regenerate draft" : "Generate post draft"}</button>
          </div>
          {draft && <div className="journey-card draft-card"><div className="journey-card-title"><h3>{platforms.find((platform) => platform.id === selectedPlatform)?.name} draft</h3><span>Not published</span></div><p className="draft-caption">{draft.caption}</p>{Array.isArray(draft.hashtags) && <p className="draft-tags">{draft.hashtags.join(" ")}</p>}<div className="draft-actions"><button className="journey-secondary" onClick={() => void copyDraft()}>Copy text</button><button className="journey-primary" onClick={() => void shareDraft()}>Share…</button><a className="journey-secondary link-button" href={platforms.find((platform) => platform.id === selectedPlatform)?.url} target="_blank" rel="noreferrer">Open platform ↗</a></div></div>}
          <div className="journey-actions"><button className="journey-text-button" onClick={() => setStep("report")}>← Back to report</button></div>
        </>}
      </section>

      {reportReady && <section className="print-report" aria-label="Printable report"><h1>Cyber Sathi — Case Report</h1><p><b>Case:</b> {caseRecord.trackingNumber || caseRecord.id}</p><p><b>Incident:</b> {caseRecord.category}</p><p><b>Reported loss:</b> {caseRecord.amount || "Not provided"}</p><h2>Incident narrative</h2><p>{narrative}</p><h2>{language === "hi" ? "सारांश" : "Summary"}</h2><p>{generatedSummary || "Generate a summary to include it in this PDF."}</p><small>Prepared from information supplied to Cyber Sathi. This record is not an official police acknowledgment.</small></section>}

      <style>{`
        .journey-shell{flex:1;min-height:0;display:flex;flex-direction:column;background:#f4f5f3;color:#16211f;font-family:inherit}
        .journey-header{display:flex;align-items:center;gap:12px;padding:14px 18px;background:white;border-bottom:1px solid #e6e8e6}
        .journey-back{border:0;background:transparent;color:#146b66;font-size:28px;cursor:pointer;padding:0 5px}
        .journey-heading{flex:1;min-width:0}.journey-heading h1{font-size:17px;margin:2px 0 1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.journey-heading p{margin:0;color:#5b6b68;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .journey-eyebrow{font-size:9px;letter-spacing:.1em;font-weight:800;color:#146b66}.journey-status{font-size:9px;color:#146b66;background:#e3f3ef;padding:5px 8px;border-radius:20px;font-weight:700}
        .journey-steps{display:flex;background:#fff;padding:10px 16px;border-bottom:1px solid #e6e8e6}.journey-step{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;border:0;background:transparent;color:#74817f;font-size:10px;font-weight:700;cursor:pointer;padding:4px}.journey-step:disabled{cursor:default;opacity:.55}.journey-step-number{width:22px;height:22px;display:grid;place-items:center;border-radius:50%;background:#edf0ef;color:#6d7977}.journey-step.active{color:#0f4c4c}.journey-step.active .journey-step-number,.journey-step.complete .journey-step-number{background:#146b66;color:white}
        .journey-content{padding:16px;overflow:auto;flex:1}.journey-intro{display:flex;gap:11px;align-items:flex-start;margin:2px 0 14px}.journey-icon{width:38px;height:38px;flex:none;display:grid;place-items:center;background:#e3f3ef;border-radius:13px;font-size:19px}.journey-intro h2{margin:0 0 4px;font-size:16px}.journey-intro p{margin:0;color:#5b6b68;font-size:11px;line-height:1.5}
        .journey-card{background:white;border:1px solid #e6e8e6;border-radius:14px;padding:14px;margin:0 0 12px;box-shadow:0 2px 8px #12252208}.upload-card{text-align:center;padding:20px 14px}.journey-primary,.journey-secondary{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:40px;padding:9px 14px;border-radius:22px;font-size:11px;font-weight:750;text-decoration:none;cursor:pointer}.journey-primary{color:white;background:#146b66;border:1px solid #146b66}.journey-primary:disabled{opacity:.55;cursor:wait}.journey-secondary{color:#146b66;background:white;border:1px solid #b8ceca}.journey-text-button{border:0;background:transparent;color:#146b66;font-size:11px;font-weight:700;padding:8px;cursor:pointer}.journey-hint{font-size:10px;line-height:1.45;color:#6f7c79;margin:9px 0 0}.journey-card-title{display:flex;align-items:center;justify-content:space-between;gap:8px}.journey-card-title h3{font-size:12px;margin:0}.journey-card-title>span{font-size:10px;color:#146b66;background:#e3f3ef;border-radius:15px;padding:4px 8px}.journey-empty{font-size:11px;color:#667572;line-height:1.5;margin:12px 0 2px}.evidence-list{list-style:none;margin:8px 0 0;padding:0}.evidence-list li{display:flex;align-items:center;gap:9px;padding:10px 0;border-top:1px solid #edf0ef}.evidence-file-icon{font-size:17px}.evidence-list li>span:nth-child(2){display:flex;flex-direction:column;flex:1;gap:3px}.evidence-list strong{font-size:11px;text-transform:capitalize}.evidence-list small{font-size:9px;color:#73807d}.evidence-state{font-size:9px;color:#146b66;text-transform:capitalize}.evidence-state.failed{color:#b23d35}.journey-actions{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:14px 0}.journey-actions-right{display:flex;align-items:center;gap:7px}.journey-alert{padding:10px 12px;border-radius:10px;font-size:11px;line-height:1.45;margin-bottom:12px}.journey-alert.error{background:#fff0ee;color:#9d332b}.journey-alert.success{background:#e3f3ef;color:#0f4c4c}.report-preview h3{font-size:14px;margin:5px 0}.report-preview p{font-size:11px;line-height:1.55;margin:8px 0;color:#35413f;white-space:pre-wrap}.report-preview .report-loss{font-weight:700;color:#a34038}.report-evidence-note{font-size:9px;color:#64716e;border-top:1px solid #edf0ef;padding-top:8px;margin-top:10px}.journey-label{display:block;font-size:11px;font-weight:750;margin-bottom:8px}.journey-select{width:100%;border:1px solid #d9e0de;border-radius:9px;padding:10px;background:#fff;color:#16211f;font:inherit;font-size:12px}.summary-card p{font-size:12px;line-height:1.6;white-space:pre-wrap;margin:9px 0 1px}.full-width{width:100%;margin-top:14px}.platform-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.platform-choice{display:flex;justify-content:space-between;align-items:center;border:1px solid #dfe5e3;background:white;padding:11px;border-radius:10px;color:#374542;font-size:11px;cursor:pointer}.platform-choice.selected{border-color:#146b66;background:#edf8f5;color:#0f4c4c;font-weight:750}.draft-card{border-color:#9bcfc2}.draft-card .journey-card-title span{color:#846322;background:#fff4d6}.draft-caption{font-size:12px;line-height:1.6;white-space:pre-wrap;margin:12px 0 6px}.draft-tags{font-size:11px;color:#146b66;line-height:1.5}.draft-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}.link-button{font-size:10px}.print-report{display:none}
        @media print{body *{visibility:hidden!important}.print-report,.print-report *{visibility:visible!important}.print-report{display:block!important;position:absolute;inset:0;padding:28px;font:12pt/1.55 Arial,sans-serif;color:#111}.print-report h1{font-size:20pt}.print-report h2{font-size:14pt;margin-top:24px}.print-report small{display:block;margin-top:40px;color:#555}}
      `}</style>
    </main>
  )
}
