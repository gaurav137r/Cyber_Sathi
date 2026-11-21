import Constants from "expo-constants"
import * as FileSystem from "expo-file-system/legacy"
import * as Sharing from "expo-sharing"
import { useEffect, useRef } from "react"
import {
  ActivityIndicator,
  BackHandler,
  Image,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  StatusBar,
  Text,
  View,
} from "react-native"
import {
  SafeAreaProvider,
  SafeAreaView,
  initialWindowMetrics,
} from "react-native-safe-area-context"
import { WebView } from "react-native-webview"
import Share, { Social } from "react-native-share"

const productionWebUrl = "https://cyber-sathi-frontend.onrender.com"
const configuredWebUrl = process.env.EXPO_PUBLIC_WEB_URL?.trim()
const expoHost = Constants.expoConfig?.hostUri?.split(":")[0]

const appUrl =
  configuredWebUrl ||
  (__DEV__ && expoHost ? `http://${expoHost}:8443` : productionWebUrl)

async function waitForShareLaunch(shareResult: Promise<unknown>) {
  const result = shareResult.then(
    () => ({ status: "finished" as const }),
    (error: unknown) => ({ status: "failed" as const, error }),
  )
  let timeout: ReturnType<typeof setTimeout> | undefined
  const launched = await Promise.race([
    result,
    new Promise<{ status: "launched" }>((resolve) => {
      timeout = setTimeout(() => resolve({ status: "launched" }), 1_000)
    }),
  ])
  if (timeout) clearTimeout(timeout)
  if (launched.status === "failed") throw launched.error
  if (launched.status === "launched") {
    void result.then((completion) => {
      if (completion.status === "failed") {
        console.warn(
          "Native share activity failed after launch",
          completion.error,
        )
      }
    })
  }
}

const nativeShellScript = `
  (function () {
    function configureNativeViewport() {
      document.documentElement.dataset.cyberSathiNative = "true";
      var viewport = document.querySelector('meta[name="viewport"]');
      if (viewport) {
        viewport.setAttribute(
          "content",
          "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        );
      }
    }
    configureNativeViewport();
    document.addEventListener("DOMContentLoaded", configureNativeViewport, { once: true });
  })();
  true;
`

export default function App() {
  const webViewRef = useRef<WebView<any>>(null)

  useEffect(() => {
    if (Platform.OS !== "android") return
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        webViewRef.current?.injectJavaScript(
          "window.dispatchEvent(new Event('cyber-sathi-back')); true;",
        )
        return true
      },
    )
    return () => subscription.remove()
  }, [])

  const respondToFileSave = (
    requestId: string | undefined,
    success: boolean,
    error?: string,
  ) => {
    const response = JSON.stringify({
      type: "SATHI_FILE_SAVE_RESULT",
      requestId,
      success,
      ...(error ? { error } : {}),
    })
    webViewRef.current?.injectJavaScript(
      `window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(
        response,
      )} })); true;`,
    )
  }

  const handlePermissionResult = (granted: boolean) => {
    webViewRef.current?.injectJavaScript(
      `window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(
        JSON.stringify({
          type: "SATHI_MICROPHONE_RESULT",
          granted,
        }),
      )} })); true;`,
    )
  }

  const handleWebViewMessage = async (event: any) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data) as {
        type?: string
        requestId?: string
        fileName?: string
        mimeType?: string
        base64?: string
        caption?: string
        platform?: string
      }

      if (payload.type === "SATHI_SAVE_FILE") {
        try {
          if (!payload.fileName || !payload.base64) {
            throw new Error("The downloaded file was incomplete.")
          }
          if (Platform.OS === "android") {
            const initialDirectory =
              FileSystem.StorageAccessFramework.getUriForDirectoryInRoot(
                "Download",
              )
            const directory =
              await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(
                initialDirectory,
              )
            if (!directory.granted) {
              throw new Error("Choose a folder to save the poster.")
            }
            const safeName = payload.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")
            const extension = safeName.match(/\.[^.]+$/)?.[0] ?? ""
            const nameWithoutExtension = extension
              ? safeName.slice(0, -extension.length)
              : safeName
            const fileUri =
              await FileSystem.StorageAccessFramework.createFileAsync(
                directory.directoryUri,
                nameWithoutExtension,
                payload.mimeType || "application/octet-stream",
              )
            await FileSystem.writeAsStringAsync(fileUri, payload.base64, {
              encoding: FileSystem.EncodingType.Base64,
            })
          } else {
            if (!FileSystem.cacheDirectory) {
              throw new Error("Device storage is unavailable.")
            }
            const safeName = payload.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")
            const fileUri = `${FileSystem.cacheDirectory}${Date.now()}-${safeName}`
            await FileSystem.writeAsStringAsync(fileUri, payload.base64, {
              encoding: FileSystem.EncodingType.Base64,
            })
            await Sharing.shareAsync(fileUri, {
              mimeType: payload.mimeType || "application/octet-stream",
              dialogTitle: `Save or share ${safeName}`,
            })
          }
          respondToFileSave(payload.requestId, true)
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Could not save the file."
          console.warn("Native file save failed", message)
          respondToFileSave(payload.requestId, false, message)
        }
        return
      }

      if (payload.type === "SATHI_SHARE_POST") {
        try {
          if (!payload.fileName || !payload.base64 || !payload.caption) {
            throw new Error("The poster or caption was incomplete.")
          }
          if (Platform.OS !== "android") {
            throw new Error(
              "Native post sharing is currently supported on Android.",
            )
          }
          if (!FileSystem.cacheDirectory) {
            throw new Error("Device storage is unavailable.")
          }
          const safeName = payload.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")
          const fileUri = `${FileSystem.cacheDirectory}${Date.now()}-${safeName}`
          await FileSystem.writeAsStringAsync(fileUri, payload.base64, {
            encoding: FileSystem.EncodingType.Base64,
          })
          const shareOptions = {
            title: "Cyber Sathi",
            message: payload.caption,
            url: fileUri,
            type: payload.mimeType || "image/png",
            filename: safeName,
            useInternalStorage: true,
          }
          const targetSocial =
            payload.platform === "linkedin"
              ? Social.Linkedin
              : payload.platform === "instagram"
                ? Social.Instagram
                : payload.platform === "facebook"
                  ? Social.Facebook
                  : undefined
          const targetPackage =
            payload.platform === "linkedin"
              ? "com.linkedin.android"
              : payload.platform === "instagram"
                ? "com.instagram.android"
                : payload.platform === "facebook"
                  ? "com.facebook.katana"
                  : undefined
          const targetInstalled =
            targetSocial && targetPackage
              ? (await Share.isPackageInstalled(targetPackage)).isInstalled
              : false
          const selectedSocial = targetInstalled ? targetSocial : undefined
          try {
            await waitForShareLaunch(
              selectedSocial
                ? Share.shareSingle({
                    ...shareOptions,
                    social: selectedSocial,
                  })
                : Share.open(shareOptions),
            )
          } catch (error) {
            if (!selectedSocial) throw error
            await waitForShareLaunch(Share.open(shareOptions))
          }
          respondToFileSave(payload.requestId, true)
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Could not share the post."
          console.warn("Native post share failed", message)
          respondToFileSave(payload.requestId, false, message)
        }
        return
      }

      if (payload.type === "SATHI_REQUEST_MICROPHONE") {
        if (Platform.OS !== "android") {
          handlePermissionResult(true)
          return
        }
        try {
          const result = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          )
          handlePermissionResult(result === PermissionsAndroid.RESULTS.GRANTED)
        } catch (error) {
          console.warn("Failed to request Android microphone permission", error)
          handlePermissionResult(false)
        }
        return
      }

      if (payload.type !== "SATHI_PICK_PHONE_NUMBER") return
      // Android cannot silently read call logs or SMS. Sathi asks the user to
      // choose a number in the in-app picker or type it themselves.
      event.target?.injectJavaScript?.(
        `window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(
          JSON.stringify({
            type: "SATHI_PHONE_PICKER_RESULT",
            available: false,
          }),
        )} })); true;`,
      )
    } catch {
      return
    }
  }

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <SafeAreaView
        style={styles.container}
        edges={["top", "right", "bottom", "left"]}
      >
        <StatusBar barStyle="light-content" />
        <WebView
          ref={webViewRef}
          source={{ uri: appUrl }}
          style={styles.webview}
          javaScriptEnabled
          domStorageEnabled
          injectedJavaScriptBeforeContentLoaded={nativeShellScript}
          setBuiltInZoomControls={false}
          setDisplayZoomControls={false}
          scalesPageToFit={false}
          mediaPlaybackRequiresUserGesture={false}
          allowsInlineMediaPlayback
          startInLoadingState
          renderLoading={() => (
            <View style={styles.splash}>
              <Image
                source={require("./assets/icon.png")}
                style={styles.logo}
              />
              <Text style={styles.title}>Cyber Sathi</Text>
              <ActivityIndicator color="#7FD1C0" />
            </View>
          )}
          renderError={() => (
            <View style={styles.message}>
              <Image
                source={require("./assets/icon.png")}
                style={styles.logo}
              />
              <Text style={styles.title}>Unable to load Cyber Sathi</Text>
              <Text style={styles.messageText}>
                Check your internet connection and try again.
              </Text>
              <Pressable
                onPress={() => webViewRef.current?.reload()}
                style={styles.retry}
              >
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </View>
          )}
          onMessage={handleWebViewMessage}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B2E2E",
  },

  webview: {
    flex: 1,
    backgroundColor: "#F4F5F3",
  },

  splash: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0B2E2E",
  },

  logo: { width: 120, height: 120, marginBottom: 16 },

  message: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#0B2E2E",
  },

  title: {
    marginBottom: 16,
    fontSize: 22,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  messageText: {
    marginBottom: 20,
    color: "#FFFFFF",
    textAlign: "center",
  },

  retry: {
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#146B66",
  },

  retryText: { color: "#FFFFFF", fontWeight: "700" },
})
