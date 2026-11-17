const widgetScriptId = "cyber-sathi-bland-widget"
const activeCaseStorageKey = "cyber-sathi-bland-case-id"
const pendingCaseStorageKey = "cyber-sathi-pending-bland-case-id"

declare global {
  interface Window {
    blandSettings?: {
      widget_id: string
      visitor_id: string
      request_data: { case_id: string; language: string }
      auto_open: boolean
      default_chat: boolean
      persist_open: boolean
    }
  }
}

export function loadBlandWidget(
  widgetId: string,
  caseId: string,
  language: string,
): Promise<void> {
  const existingScript = document.getElementById(widgetScriptId)
  if (existingScript) {
    if (sessionStorage.getItem(activeCaseStorageKey) !== caseId) {
      sessionStorage.setItem(pendingCaseStorageKey, caseId)
      window.location.reload()
      return new Promise(() => {})
    }
    return Promise.resolve()
  }

  window.blandSettings = {
    widget_id: widgetId,
    visitor_id: caseId,
    request_data: { case_id: caseId, language },
    auto_open: true,
    default_chat: false,
    persist_open: true,
  }

  const script = document.createElement("script")
  script.id = widgetScriptId
  script.src = "https://widget.bland.ai/loader.js"
  script.defer = true

  return new Promise((resolve, reject) => {
    script.onload = () => {
      sessionStorage.setItem(activeCaseStorageKey, caseId)
      resolve()
    }
    script.onerror = () => {
      script.remove()
      reject(new Error("Could not load the Bland chat and voice widget."))
    }
    document.head.appendChild(script)
  })
}

export function consumePendingBlandCase(): string | null {
  const caseId = sessionStorage.getItem(pendingCaseStorageKey)
  if (caseId) sessionStorage.removeItem(pendingCaseStorageKey)
  return caseId
}

export function sendOcrTextToBland(text: string, fileName: string): void {
  const safeText = redactSensitiveLines(text)
  if (!safeText.trim())
    throw new Error(
      "No shareable text remained after protecting sensitive credentials.",
    )

  window.postMessage(
    `widget-message:I uploaded ${fileName}. The following is OCR text from the image. Treat it as unverified evidence, do not assume it is correct, and ask me to confirm any important values:\n${safeText}`,
    window.location.origin,
  )
}

function redactSensitiveLines(text: string): string {
  const sensitiveLabel =
    /\b(?:one[- ]time password|otp|pin|password|cvv|cvc|aadhaar|aadhar|pan number|full account number|account number|card number)\b/i

  return text
    .split(/\r?\n/)
    .map((line) => {
      if (!sensitiveLabel.test(line)) return line
      const labelEnd = line.search(sensitiveLabel)
      const separator = line.indexOf(":", labelEnd)
      if (separator < 0) return "[Sensitive credential omitted]"
      return `${line.slice(0, separator + 1)} [redacted]`
    })
    .join("\n")
}
