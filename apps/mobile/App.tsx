import Constants from "expo-constants"

import { useRef } from "react"

import {
  PermissionsAndroid,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { WebView } from "react-native-webview"

const expoHost = Constants.expoConfig?.hostUri?.split(":")[0]

const appUrl =
  process.env.EXPO_PUBLIC_WEB_URL ??
  (expoHost ? `http://${expoHost}:8443` : null)

export default function App() {
  const webViewRef = useRef<WebView>(null)

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

  return (
    <View style={styles.container}>
      <WebView
        source={{ uri: appUrl }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        mediaPlaybackRequiresUserGesture={false}
        allowsInlineMediaPlayback
        onMessage={(event) => {
          try {
            const payload = JSON.parse(event.nativeEvent.data) as {
              type?: string
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
        }}
        onPermissionRequest={(request) => {
          // Only the trusted app origin may request microphone access. Ask Android
          // through its runtime permission API before granting the WebView request.
          const trustedOrigin = appUrl ? new URL(appUrl).origin : ""
          const isTrustedOrigin = request.origin === trustedOrigin
          const requestsAudio = request.resources.includes("AUDIO_CAPTURE")
          if (
            !isTrustedOrigin ||
            !requestsAudio ||
            request.resources.length !== 1
          ) {
            request.deny()
            return
          }
          void PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          )
            .then((result) => {
              if (result === PermissionsAndroid.RESULTS.GRANTED)
                request.grant(["AUDIO_CAPTURE"])
              else request.deny()
            })
            .catch(() => request.deny())
        }}
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
