# Android release builds

The `Build Android APK` GitHub Actions workflow builds a signed APK from the
Expo-managed app. It runs for a `v*` tag or by manual dispatch.

## One-time signing setup

Create the release keystore on a trusted machine and keep a second encrypted
backup. Android signing keys are needed to publish future app updates. Losing
the keystore or its passwords can prevent users from updating an installed
build.

Run from `apps/mobile`:

```sh
keytool -genkeypair -v -keystore cyber-sathi-release.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias cyber-sathi
```

Set a unique keystore password and key password. Store them with the keystore
backup in a password manager or encrypted vault. Do not commit the keystore or
passwords to Git. The mobile `.gitignore` excludes generated Android files and
`.jks`, `.keystore`, and `.b64` files.

Create the base64 value without adding line breaks:

```sh
base64 cyber-sathi-release.jks | tr -d '\n'
```

Add these repository Actions secrets in GitHub Settings → Secrets and variables
→ Actions:

| Name | Value |
| --- | --- |
| `KEYSTORE_BASE64` | Base64 output for the keystore |
| `KEYSTORE_PASSWORD` | Keystore password |
| `KEY_ALIAS` | `cyber-sathi` |
| `KEY_PASSWORD` | Password for the signing key |

Add `EXPO_PUBLIC_WEB_URL` as a repository Actions variable. It must be the
production URL `https://cyber-sathi-frontend.onrender.com`. Release builds
verify that the bundled WebView points to this frontend rather than an Expo
development server. In development, the app may use the local Expo host.

Do not put Gemini, Supabase, or keystore credentials in `EXPO_PUBLIC_*` values.
Those values are embedded in the app bundle. Keep server credentials in the API
runtime environment.

## Build and release

- Run the workflow manually from Actions to build an artifact.
- Push a version tag such as `v1.0.2` to build the APK and attach it to a GitHub
  Release.
- The APK is produced at `apps/mobile/android/app/build/outputs/apk/release/`.

The workflow does not push Supabase migrations. Review and apply database
migrations separately in the intended environment.
