import Constants from "expo-constants"

import { useRef } from "react"

import {
  ActivityIndicator,
  Image,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { WebView } from "react-native-webview"

const productionWebUrl = "https://cyber-sathi-frontend.onrender.com"
const configuredWebUrl = process.env.EXPO_PUBLIC_WEB_URL?.trim()
const expoHost = Constants.expoConfig?.hostUri?.split(":")[0]

const appUrl =
  configuredWebUrl ||
  (__DEV__ && expoHost ? `http://${expoHost}:8443` : productionWebUrl)

export default function App() {
  const webViewRef = useRef<WebView<any>>(null)

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
        startInLoadingState
        renderLoading={() => (
          <View style={styles.splash}>
            <Image source={require("./assets/icon.png")} style={styles.logo} />
            <Text style={styles.title}>Cyber Sathi</Text>
            <ActivityIndicator color="#7FD1C0" />
          </View>
        )}
        renderError={() => (
          <View style={styles.message}>
            <Image source={require("./assets/icon.png")} style={styles.logo} />
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
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F5F3" },

  webview: { flex: 1 },

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

  messageText: { marginBottom: 20, color: "#FFFFFF", textAlign: "center" },

  retry: {
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#146B66",
  },

  retryText: { color: "#FFFFFF", fontWeight: "700" },
})
