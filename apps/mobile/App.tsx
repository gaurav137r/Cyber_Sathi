import Constants from "expo-constants"

import { useRef } from "react"

import {
  PermissionsAndroid,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { WebView } from "react-native-webview"

const expoHost = Constants.expoConfig?.hostUri?.split(":")[0]

const appUrl =
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.EXPO_PUBLIC_WEB_URL ??
  (expoHost
    ? `http://${expoHost}:8443`
    : null)

export default function App() {
  const webViewRef = useRef<WebView<any>>(null)

  if (!appUrl) {
    return (
      <SafeAreaView style={styles.message}>
        <Text style={styles.title}>Cyber Sathi</Text>
        <Text>
          Start the Expo app on your local network to connect to the web
          preview.
        </Text>
      </SafeAreaView>
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
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ uri: appUrl }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        mediaPlaybackRequiresUserGesture={false}
        allowsInlineMediaPlayback
        onMessage={handleWebViewMessage}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F5F3" },

  webview: { flex: 1 },

  message: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#F4F5F3",
  },

  title: { marginBottom: 8, fontSize: 22, fontWeight: "700", color: "#0B2E2E" },
})
