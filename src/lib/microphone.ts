// Shared microphone access helpers.
//
// The web app runs both in a normal browser and inside the Android WebView
// shell. In a browser we use the standard WebRTC `getUserMedia` API. Inside
// the Android shell we first ask the native side for the RECORD_AUDIO
// permission through the WebView bridge, then fall back to the same WebRTC
// API (which the WebView grants through `onPermissionRequest`).

export function isSecureContextAvailable(): boolean {
  return typeof window !== "undefined" && Boolean(window.isSecureContext)
}

export function isAndroidWebView(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as any).ReactNativeWebView?.postMessage)
  )
}

export async function requestAndroidMicrophonePermission(): Promise<boolean> {
  if (!isAndroidWebView()) return true

  return new Promise<boolean>((resolve) => {
    const target = (window as any).ReactNativeWebView
    let timeout: number
    const cleanup = () => {
      window.clearTimeout(timeout)
      window.removeEventListener("message", handleMessage)
    }

    const handleMessage = (event: MessageEvent) => {
      try {
        const data =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data
        if (data?.type === "SATHI_MICROPHONE_RESULT") {
          cleanup()
          resolve(Boolean(data.granted))
        }
      } catch {
        // Ignore unrelated messages.
      }
    }

    timeout = window.setTimeout(() => {
      cleanup()
      resolve(false)
    }, 10000)
    window.addEventListener("message", handleMessage)
    try {
      target.postMessage(JSON.stringify({ type: "SATHI_REQUEST_MICROPHONE" }))
    } catch {
      cleanup()
      resolve(false)
    }
  })
}

export async function requestMicrophoneAccess(): Promise<MediaStream> {
  if (!isSecureContextAvailable()) {
    throw new DOMException(
      "Microphone access requires HTTPS or localhost.",
      "SecurityError",
    )
  }

  if (isAndroidWebView()) {
    const granted = await requestAndroidMicrophonePermission()
    if (!granted) {
      throw new DOMException(
        "Microphone permission was denied or the Android app did not respond.",
        "NotAllowedError",
      )
    }
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException(
      "This browser does not support microphone access.",
      "NotSupportedError",
    )
  }

  // `audio: true` selects the platform default input device.
  return navigator.mediaDevices.getUserMedia({ audio: true })
}

export function getMicrophoneErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "UnknownError"

  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Allow microphone access for this site, then try again."
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No microphone was found on this device."
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "The microphone is busy or unavailable."
  }
  if (name === "SecurityError") {
    return "Microphone access requires HTTPS or localhost."
  }
  if (name === "NotSupportedError") {
    return "This browser does not support microphone access."
  }
  return `Microphone error (${name}). Check this site's microphone permission and try again.`
}
