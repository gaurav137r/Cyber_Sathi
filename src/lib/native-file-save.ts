type NativeSaveResult = {
  type?: string
  requestId?: string
  success?: boolean
  error?: string
}

type NativeWebViewBridge = {
  postMessage: (message: string) => void
}

declare global {
  interface Window {
    ReactNativeWebView?: NativeWebViewBridge
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== "string") {
        reject(new Error("Could not read the downloaded file."))
        return
      }
      const separator = result.indexOf(",")
      if (separator < 0) {
        reject(new Error("Could not encode the downloaded file."))
        return
      }
      resolve(result.slice(separator + 1))
    }
    reader.onerror = () =>
      reject(reader.error || new Error("Could not read the downloaded file."))
    reader.readAsDataURL(blob)
  })
}

async function sendBlobToNativeApp(
  action: "SATHI_SAVE_FILE" | "SATHI_SHARE_POST",
  blob: Blob,
  fileName: string,
  mimeType: string,
  options: { caption?: string platform?: string } = {},
): Promise<boolean> {
  const bridge = window.ReactNativeWebView
  if (!bridge?.postMessage) return false

  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const base64 = await blobToBase64(blob)

  return new Promise((resolve, reject) => {
    let timeout: number
    const cleanup = () => {
      window.clearTimeout(timeout)
      window.removeEventListener("message", handleMessage)
    }
    const handleMessage = (event: MessageEvent) => {
      let result: NativeSaveResult
      try {
        result =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data
      } catch {
        return
      }
      if (
        result?.type !== "SATHI_FILE_SAVE_RESULT" ||
        result.requestId !== requestId
      ) {
        return
      }
      cleanup()
      if (result.success) resolve(true)
      else
        reject(new Error(result.error || "Could not save the downloaded file."))
    }

    timeout = window.setTimeout(
      () => {
        cleanup()
        reject(new Error("The save dialog did not respond. Please try again."))
      },
      action === "SATHI_SHARE_POST" ? 8_000 : 120_000,
    )
    window.addEventListener("message", handleMessage)
    try {
      bridge.postMessage(
        JSON.stringify({
          type: action,
          requestId,
          fileName,
          mimeType,
          base64,
          ...options,
        }),
      )
    } catch (error) {
      cleanup()
      reject(
        error instanceof Error
          ? error
          : new Error("Could not send the file to the native app."),
      )
    }
  })
}

export function saveBlobInNativeApp(
  blob: Blob,
  fileName: string,
  mimeType: string,
): Promise<boolean> {
  return sendBlobToNativeApp("SATHI_SAVE_FILE", blob, fileName, mimeType)
}

export function sharePostInNativeApp(
  blob: Blob,
  fileName: string,
  mimeType: string,
  caption: string,
  platform: string,
): Promise<boolean> {
  return sendBlobToNativeApp("SATHI_SHARE_POST", blob, fileName, mimeType, {
    caption,
    platform,
  })
}
