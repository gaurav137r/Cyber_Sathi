# CyberSathi — Full Prototype Build Specification
**"Your Voice Against Scams" | Speak, we are listening**

This document is a complete, self-contained build brief for an AI coding agent (or a human dev team) to reproduce the CyberSathi mobile app prototype: a voice-first cybercrime/fraud reporting assistant that transcribes an incident, classifies it, auto-fills the correct government portal, files a complaint, tracks resolution, and lets users share verified scam alerts with the community — in **English and Hindi**.

---

## 1. Product Principles

1. **Voice-first, typing-optional.** Every core action (reporting, answering clarifications, reviewing) has a "speak" affordance alongside text.
2. **Calm authority.** The visual language should feel like a trustworthy government-adjacent utility, not a flashy consumer app — deep teal, generous whitespace, no clutter.
3. **Radical transparency at each automated step.** Whenever the AI is acting (analyzing, auto-filling a real portal, submitting), the UI must visibly show *what* it's doing and require explicit confirmation before anything irreversible happens.
4. **Never a dead end.** Every screen has a clear next action and a way back.
5. **Bilingual from the ground up**, not bolted on — all strings pulled from a locale table, Hindi rendered in Devanagari with a font that supports it natively.

---

## 2. Design Tokens

### 2.1 Color Palette

| Token | Hex | Usage |
|---|---|---|
| `color/teal-900` (Ink Teal) | `#0B2E2E` | Splash background, voice-listening screen bg, OTP header panel, primary text on light |
| `color/teal-700` (Deep Teal) | `#0F4C4C` | Secondary dark surfaces, gradient stop |
| `color/teal-600` (Primary) | `#146B66` | Primary CTA buttons, active tab icon, links, progress bars |
| `color/teal-500` | `#1D8577` | Hover/pressed state, icon circles |
| `color/mint-300` (Accent Gradient) | `#7FD1C0` | Gradient blob accents, loading orb highlight |
| `color/mint-100` (Tint) | `#E3F3EF` | Info banners, selected chip background, soft cards |
| `color/bg-canvas` | `#F4F5F3` | App background (light screens) |
| `color/surface-white` | `#FFFFFF` | Cards, sheets, input fields |
| `color/text-primary` | `#16211F` | Headings, primary body text |
| `color/text-secondary` | `#5B6B68` | Captions, helper text, timestamps |
| `color/text-inverse` | `#FFFFFF` | Text on dark/teal surfaces |
| `color/warning-bg` | `#FCEBB6` | Scam alert banner background |
| `color/warning-icon` | `#F0A93A` | Warning triangle icon fill |
| `color/danger` | `#E15347` | "Not Received" states, missed-call icon, pending escalation |
| `color/success` | `#3FAE5C` | Success checkmarks, resolved badges |
| `color/success-bg` | `#DFF3E4` | Resolved status pill background |
| `color/status-progress-bg` | `#FDECC8` | "In Progress" pill |
| `color/status-review-bg` | `#DCEBFB` | "Under Review" pill |
| `color/status-action-bg` | `#FBDEDA` | "Action Needed" pill |
| `color/divider` | `#E6E8E6` | Hairlines between list rows |
| `color/disabled` | `#9AA6A3` on `#E3E6E4` | Disabled buttons (e.g., "Resend OTP" countdown, empty OTP submit) |

**Gradients**
- `gradient/brand-blob`: radial/linear from `teal-900` → `teal-500` → `mint-300`, used for the layered overlapping circle motif on splash and loading screens.
- `gradient/orb-active`: `teal-500` → `mint-300`, used on the "Understanding what happened" processing icon and mic orb glow.

### 2.2 Typography

- **Display/Wordmark font:** A rounded, friendly geometric sans (e.g. *Baloo 2*, *Quicksand Bold*, or *Poppins SemiBold* as fallback) — used only for the "CyberSathi" logotype and large screen titles ("Complaint Filed Successfully!", step headings).
- **UI/body font:** A humanist sans with full Devanagari coverage (e.g. **Noto Sans** / **Noto Sans Devanagari**, or **Hind** for Hindi + **Inter** for English, font-swapped by locale). This is critical — do not use a Latin-only font for the Hindi locale.
- **Monospace/Numeric:** Tabular figures for OTP boxes, tracking numbers, phone numbers — use `font-feature-settings: 'tnum'`.

| Style | Size | Weight | Line-height | Usage |
|---|---|---|---|---|
| Display/XL | 32px | 700 | 1.15 | "CyberSathi" wordmark, success headline |
| Title/H1 | 24px | 700 | 1.25 | Screen titles ("Onboarding", "Scam Analysis") |
| Title/H2 | 18px | 600 | 1.3 | Card titles, category name |
| Body/Large | 16px | 500–600 | 1.4 | Primary content, chat bubbles |
| Body | 14px | 400–500 | 1.45 | Descriptions, list secondary text |
| Caption | 12px | 500 | 1.3 | Timestamps, labels, tags (uppercase, +4% letter-spacing) |
| Button | 16px | 700 | 1 | CTA labels |

### 2.3 Shape, Elevation & Spacing

- **Corner radius:** cards `20px`, buttons/pills `28px` (fully rounded), input fields `16px`, small chips `20px`, OTP boxes `12px`.
- **Elevation:** flat design with soft ambient shadow only on floating elements: `0px 8px 24px rgba(11,46,46,0.08)`. Dark-surface cards on dark backgrounds use a lighter border instead of shadow (`1px solid rgba(255,255,255,0.08)`).
- **Spacing scale:** 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40px. Screen horizontal padding = 20px. Section vertical gap = 24–32px.
- **Status bar / safe area:** design for iOS-style safe areas (notch-aware top padding ~44px, home-indicator bottom padding ~24px).

### 2.4 Iconography
Line icons, 1.5–2px stroke, rounded caps, teal-600 by default, white when on dark or filled circular badges. Core icon set: microphone, phone/call, message/SMS, shield-check, lock, document, share/network, checkmark-circle, x-circle, flag, chevron, play/pause, gear/permissions, person.

---

## 3. Motion & Animation Guidelines

Motion should communicate **listening → thinking → confirming**, never feel decorative for its own sake.

| Moment | Animation |
|---|---|
| Splash screen | The 3 overlapping teal/mint blobs drift very slowly (subtle parallax float, 6–8s loop, ±6px), logotype fades/scales in (0→1, 400ms, ease-out) after 300ms delay, tagline fades in 200ms after that. Auto-advance after ~1.8s or on tap. |
| Onboarding slide transitions | Horizontal slide + crossfade, 280ms ease-in-out; progress dots animate width (inactive 6px dot → active 18px pill) |
| Radio/checkbox selection (language, permissions) | Border color + fill morph 150ms; check icon scales in with a small bounce (spring, damping ~0.6) |
| Toggle switches (Permissions) | Thumb slides 180ms ease, track color crossfades teal/grey |
| Mic orb (idle, Home) | Gentle breathing pulse — outer glow ring scales 1.0→1.08 opacity 0.5→0.2, 2.2s loop |
| "Listening Live" screen | Concentric circles behind mic pulse outward continuously (like sonar) synced to simulated audio amplitude; waveform/caption text fades in per word (typewriter or fade-up per phrase, ~40ms/char) |
| Processing / "Understanding what happened" | Central gradient orb rotates its inner gradient slowly (360° / 4s, linear) + soft scale pulse; checklist items animate one at a time: dashed circle → filled teal circle → white check icon draws in (stroke-dashoffset animation, 300ms), each ~800–1200ms apart, accompanied by a subtle haptic tick (native) |
| Contextual disambiguation card sliding up (e.g. "Which number did you get that call…?") | Slides up from bottom over the processing screen, 300ms spring, background dims/desaturates behind it |
| OTP digit entry | Each digit: box border flashes teal then settles, digit character does a quick scale-in (0.8→1, 120ms); active box has a blinking caret |
| Button press | Scale 0.97 on press-down (100ms), release springs back; primary buttons have a very subtle shimmer sweep on first appearance to draw the eye (one-time, 800ms) |
| Category detected reveal (Scam Analysis) | Warning icon "pops" in with a small overshoot bounce; category text fades/slides up after |
| Auto-fill webview simulation | Top progress bar fills continuously (indeterminate-to-determinate, 0%→100% tied to fields being filled); each form field's value types in character-by-character (mimicking autofill), field border flashes teal briefly once filled |
| Submission success | Checkmark icon: circle draws in (stroke animation) then checkmark draws in 200ms after, both ease-out; confetti-free — keep it dignified/calm, maybe a single soft radial glow pulse behind the icon |
| Tracking number reveal | Number characters count/scramble briefly (150ms) before settling — optional, low priority polish |
| Case status timeline | Stepper connector line animates fill from bottom-up as you scroll into view; active step's dot has a soft pulsing ring |
| Share sheet | Bottom sheet slides up with rubber-band spring, backdrop fades to 40% black, contact/app avatars stagger-fade in (40ms stagger) |
| Tab bar switch | Icon scale bounce (1→1.15→1) + label color crossfade + small dot/pill background slide behind active icon |
| Audio playback (recordings, community posts) | Play button morphs to pause (icon crossfade), waveform bars animate height randomly in sync with mock playback progress, progress fill sweeps left→right |

General rules: use `ease-out` for entrances, `ease-in` for exits, spring physics (stiffness ~300, damping ~25) for anything the user directly manipulates (toggles, sheets, drag). Keep all transitions ≤400ms except ambient/idle loops. Respect `prefers-reduced-motion` — fall back to simple opacity fades, no bounces/parallax.

---

## 4. Localization (English + Hindi)

- All UI strings live in a single locale map: `strings.en.json` and `strings.hi.json`, keyed identically (e.g. `onboarding.language.title`, `cta.confirmLanguage`).
- Font swap by locale: English → Inter/Poppins; Hindi → Noto Sans Devanagari (weight-matched 400/500/600/700). Never fake Hindi rendering with a Latin font.
- The **Language step is Step 1 of onboarding** (as shown in the source screens) — selecting Hindi/Bengali immediately re-renders all subsequent onboarding copy in that language, including voice-prompt captions.
- Voice input/output (STT/TTS) must respect the selected language — the "Listening Live" caption and "Hear Question"/"Listen to Summary" TTS playback should use the matching language voice.
- Numerals: keep phone numbers, OTPs, currency (₹) in standard Arabic numerals for both locales for clarity (do not switch to Devanagari numerals).
- Date formatting: `DD MMM, YYYY` in English; localized month names in Hindi (`२४ जन॰ २०२६` style optional — Latin-numeral fallback acceptable for prototype).
- Provide a persistent language switch in **Profile → App Language** (dropdown, not just at onboarding) so users can change it anytime without losing case data.
- Right-to-left is **not** needed (Hindi/Bengali are LTR) — no mirroring required.

---

## 5. Information Architecture

```
Splash
 └─ Onboarding (4 steps)
     1. Language selection
     2. How Sathi works (3-slide carousel: voice input / privacy / community)
     3. Permissions (Call Logs, SMS, Microphone, Call Recordings)
     4. OTP Verification (phone number)
 └─ Main App (bottom tab bar, persists across these 4 tabs)
     ├─ Assistant (Home) — default tab
     │    └─ Voice capture → Processing → Disambiguation → Category
     │       Detection → Review Details → Clarification Q&A →
     │       Portal Auto-fill (webview) → Final Verification (OTP+Captcha)
     │       → Submission Success → (link to) Case Status
     ├─ My Cases
     │    └─ Case list → Case Status detail → Resolution Support →
     │       Escalation (RBI Ombudsman / Share to Community)
     ├─ Defend (Community)
     │    └─ Community feed list → Scam Detail (with audio evidence,
     │       "I got this too" / "Sounds Fake" community actions)
     └─ Profile
          └─ Profile settings → Manage Permissions → Data & Privacy →
             Log Out
```

Bottom tab bar is present on all 4 main-tab screens and hidden during the linear report-filing flow (Voice capture → Submission Success) to keep the user focused, reappearing once they land back on Assistant/My Cases.

---

## 6. Screen-by-Screen Specification

For each screen: **Purpose, Layout, Components, States, Copy keys (EN/HI), Transition in/out.**

### 6.1 Splash Screen
- **Purpose:** Brand moment + implicit "we're always listening/ready" positioning.
- **Layout:** Full-bleed `teal-900` background, 3 overlapping soft-edged circles (gradient teal→mint) positioned upper-right, wordmark "CyberSathi" centered-lower-third, tagline "YOUR VOICE AGAINST SCAMS" in caps/letter-spaced caption below, a small waveform glyph (∿) icon, italic quote `"Speak, we are listening"`.
- **States:** cold start (full animation) vs. resumed session (skip straight to Assistant tab).
- **Duration:** ~1.8–2s then auto-navigate to onboarding (first run) or Assistant tab (returning user, token cached).

### 6.2 Onboarding — Step 1: Language
- **Header:** Back chevron (disabled/hidden on first step), title "Language" (H1) + subtitle "Select your preferred language", right-aligned "Step 1 of 4 / Progress" label.
- **Info banner:** mint-100 pill, rounded, icon-less, text: "We support voice inputs in multiple regional languages to make reporting seamless."
- **Selectable list:** radio-style cards — English (Primary Language), Hindi / हिंदी (Hindi Support), Bengali / বাংলা (Bengali Support). Selected card gets teal border + filled teal check circle on the right; unselected = white card, grey outline circle.
- **CTA:** Full-width pill button "Confirm Language" — **disabled/grey until a selection is made**, becomes solid `teal-600` once selected.
- Tapping a language card **immediately re-locale's the rest of the onboarding flow** in real time (live preview), not just after confirming.

### 6.3 Onboarding — Step 2: How Sathi Works (carousel, 3 slides)
- Same header pattern, "Step 2 of 4".
- **Card area:** white rounded illustration container (top ~55% of card) + headline (H1, bold) + 2-line description below.
  - Slide 1: mic + soundwave illustration → "Just speak, no typing needed" / "Simply explain the incident in your own words. Sathi is trained to parse fraud descriptions and capture important facts automatically."
  - Slide 2: shield/lock illustration → "Your data is protected as you are" / "Your incident details stay private and isolated. Sathi processes them only to create your report and never stores, shares, or uses the data for training or any other purpose."
  - Slide 3: 3-person community icon illustration → "Let's defeat cyber crime together" / "You are backed by a strong community that intends to help people stand against cyber crimes and raise their voice."
- **Progress dots:** 3 dots, active dot elongates into a pill (teal-600), inactive = small grey-green dot.
- **Footer:** "Skip" (text button, left) + "Next Slide" (solid pill button, right) — on slide 3 the right button becomes "Continue".
- Swipeable horizontally in addition to button taps.

### 6.4 Onboarding — Step 3: Permissions
- Header "Permissions" / "Grant required access to proceed", Step 3 of 4.
- **Trust banner:** mint-100 rounded card, waveform icon in teal circle, "Permissions secure your identity" (bold) / "These help verify scam logs automatically" (secondary).
- **4 toggle rows**, each: icon in soft-teal circle, title (bold), 1-line description, right-aligned iOS-style toggle switch:
  1. **Call Logs** — "Used to cross-verify and flag active spam numbers." (default OFF)
  2. **SMS Messages** — "Scans fake bank alerts and dangerous URLs." (default OFF)
  3. **Microphone** — "Allows you to speak and explain incidents directly." (default **ON**, since it's core to the product)
  4. **Call Recordings** — "Turn on recording calls from unknown numbers." (default **ON**)
- **CTA:** "Allow & Continue" (shield-check icon prefix, solid teal pill) triggers native OS permission prompts sequentially for any toggle left ON.
- **Secondary link:** "Do this later" (underlined text, centered below CTA) — routes to Assistant home with permissions marked pending; a persistent soft-nudge banner can reappear later prompting to enable them.

### 6.5 Onboarding — Step 4: OTP Verification
- Header "OTP Verification" / "Complete the final registration step", Step 4 of 4.
- **Lock icon** inside a soft radial teal-glow circle, centered.
- **Phone display card:** flag emoji/icon + "+91" + masked/full number "98765 43210" + caption "OTP sent to your registered number".
- **6-box OTP input**, tabular-num, auto-advances focus per digit, active box has teal border + blinking cursor glyph.
- **Trust microcopy banner:** mint pill, shield icon, "Verified report environment" (bold) / "We confirm numbers to maintain scam data legitimacy."
- **CTA:** "Verify & Continue" — disabled/grey until all 6 digits entered, then solid teal, auto-submits or requires explicit tap (prototype: require tap).
- **Resend:** "Didn't get code? **Resend OTP** in 45s" — countdown timer text, link becomes active/underlined teal at 0s.
- On success → route into Main App, Assistant tab, with a first-run contextual tooltip optionally pointing at the mic orb.

### 6.6 Assistant (Home) Tab
- **Top banner (conditional):** warning-yellow card if a relevant local scam pattern exists for the user's region, e.g. "⚠ Scam Alert: Electricity Bill SMS — Be careful of text warnings threatening utility disconnection." Dismissible.
- **Prompt card:** mint-100 rounded card, mic icon in teal circle, "Tap and tell Sathi what happened" (bold) / "Explain the cyber fraud incident in simple English" (or localized language name dynamically, e.g. "...in simple Hindi").
- **Primary mic orb:** large circular teal button, centered, mic icon, idle breathing-pulse animation (see §3), label below: "Tap Center Orb to Speak".
- **Common Scam Topics:** 2×2 grid of tappable shortcut cards (Lost Money / Unauthorized deduction, Spam Caller / Threats or fake rewards, Fake Website / Phishing links, Fake Calls / Acting like your known ones) — tapping one pre-seeds the conversation with that category context, skipping straight to Clarification Q&A.
- **Bottom tab bar:** Assistant (active) / My Cases / Defend / Profile.

### 6.7 Voice Capture — "Listening Live"
- Full-bleed `teal-900` background (distinguishing "live/recording mode" from the light home screen — an important state cue).
- Top pill badge "● LISTENING LIVE" (pulsing red/white dot).
- Subtext: "Speak clearly into your microphone."
- **Central mic orb** with sonar-ring pulse animation synced to (simulated) input amplitude.
- **Live captions card** (dark-teal-800 translucent panel) showing real-time STT transcript in quotes, streaming word-by-word: `"Yesterday..."` growing as user speaks.
- **Stop button:** pill button, red/danger fill, home icon + "Stop Listening" — tapping ends capture and transitions to Processing.
- Also offer a text-input fallback icon (small keyboard glyph) in a corner for users who'd rather type — always keep a non-voice path available.

### 6.8 AI Processing — "Understanding what happened"
- Dark `teal-900` background continues (visually one continuous "AI is working" state with the previous screen).
- Central rotating-gradient orb icon (gear/cog inside gradient circle).
- Headline "Understanding what happened" + subtext "Sathi is extracting fraud indicators from your statement."
- **Sequential checklist**, 3 items, animate one at a time (dashed empty circle → filled teal circle with white check):
  1. Transcribed voice recording
  2. Checking suspicious messages
  3. Checking recent caller identity...
- If the transcript references an ambiguous phone number/caller, **step 3 pauses and a bottom sheet slides up over the dimmed processing screen**: "Which number did you get that call…?" listing 2–3 candidate numbers pulled from Call Logs (each showing name/unknown badge, number, "Reported 28+ times as Scam" warning tag where applicable, saved-contact checkmark where applicable) + a "Call History" button to browse further. User taps the correct one, sheet dismisses, step 3 completes, processing continues automatically to Scam Analysis.
- If the transcript references a call recording ("I have it recorded"), a similar bottom sheet **"Available Call Recordings"** lists dated/duration entries with inline play buttons; user selects one via "Select Recording", it's attached as evidence.

### 6.9 Scam Analysis (Category Detection)
- Light background resumes (`bg-canvas`).
- Header "Scam Analysis" / "Sathi has categorized your incident", back chevron.
- **Result card:** warning-yellow bordered card, centered warning-triangle icon in solid amber circle, caption label "DETECTED CATEGORY" (uppercase, small), large bold category name e.g. **"UPI Payment Fraud"**.
- **Filing Information card:** white card, "Filing Information" (H2) + explanatory paragraph naming the specific official portal this will be filed to (this is the **category → portal routing logic**, see §7) + a "Not correct? **Change category**" link (help icon prefix) that opens a category picker sheet if the AI misclassified.
- **CTA:** "Continue →" solid teal pill, fixed to bottom.

### 6.10 Review Details
- Header "Review Details" / "Ensure the information is completely correct".
- **"Listen to Summary" card:** mint pill with play icon, "Hear the auto-generated voice report" — tapping plays TTS of the full extracted summary; button morphs into an inline audio-progress bar (pause icon + animated waveform) while playing.
- **Editable fields list** (each row: uppercase caption label, value, pencil/edit icon on the right that opens an inline editor or the clarification chat for that field):
  - Scammer Phone Number
  - Amount Lost (₹)
  - Date & Time
  - Bank/App Used
  - Brief Description (multi-line)
- **Footer, two stacked buttons:** "+ Add More Details" (outline/secondary teal pill) and "✓ Looks Right, Continue" (solid teal pill, primary).

### 6.11 Clarification (Conversational Q&A)
- Header "Clarification" / "Help Sathi narrow down the details".
- **Chat transcript layout:** AI messages left-aligned in white bubbles with a small teal avatar icon (briefcase/shield glyph) + inline "🔊 Hear Question" link under each AI message; user messages right-aligned in solid `teal-600` bubbles with white text.
- **Suggestion chips row:** labeled "SUGGESTIONS:", horizontally wrapped pill buttons with likely quick-answers (e.g. "PhonePe", "Google Pay", "Bank Transfer", "Not Sure") — tapping one auto-sends it as the user's reply.
- **Bottom input bar:** rounded pill, "Hold & Speak to Answer" placeholder text + mic icon button (press-and-hold to record, matching platform patterns), plus a small keyboard-toggle affordance for typed replies.
- This screen can be re-entered any time a field needs clarification (either from Review Details' edit icons or spontaneously if the AI needs more info before filing).

### 6.12 Portal Auto-fill (WebView Simulation)
- **Purpose:** Visually show the AI filling the *actual* official portal (e.g. cybercrime.gov.in / NCRP) on the user's behalf, inside an embedded webview, with full transparency.
- **Top progress bar:** fixed header, dark-teal, "Auto-filling on cybercrime.gov.in…" label + right-aligned live percentage (0%→100%), thin progress track beneath filling left-to-right.
- **Webview content area (mocked for prototype):** renders a simplified replica of the official portal's form header ("NATIONAL CYBER CRIME PORTAL — Government of India • Official Submission" with shield icon) and form fields, each pre-filled value appearing with a brief type-in animation and a momentary teal border flash to show "just filled": Category of Complaint, Suspect Mobile Number, Date of Incident, etc. — mapped directly from Review Details data.
- **Trust/safety footer banner:** amber-tinted, shield-warning icon, bold "Sathi is auto-filling this securely." + "**Nothing will be submitted without your explicit confirmation and review on the next screen.**"
- **CTA:** "→ Proceed to Verify" — **disabled (grey) until autofill animation reaches 100%**, then becomes solid teal and enabled.
- *(Implementation note for the agent: this can be a genuine embedded `<webview>`/`iframe` pointed at a sandboxed mock endpoint for the prototype, or a purely native-rendered visual replica — either is acceptable for demo purposes, but must never auto-submit to a real government endpoint without live user-confirmed data and real consent flows in production.)*

### 6.13 Final Verification (Portal-side OTP + Captcha)
- This screen represents the *official portal's own* verification step (distinct from the app's earlier OTP in onboarding) — visually differentiated with the portal's own header style: dark-teal top panel "Final Verification" / "Enter the OTP sent by NCRP to verify your Identity", flowing into a white lower panel.
- **6-box OTP input** (same component as §6.5, reused).
- **Security Code (Captcha) block:** a captcha-image-style teal monospace code display (e.g. `W7K9P` with strikethrough/distortion styling to look like a captcha image) + refresh icon button + a text input below "Type the security code above" that validates against it.
- **CTA:** "🛡 Submit Complaint" — dark, fixed bottom, disabled until both OTP and captcha are correctly filled.

### 6.14 Submission Success
- Centered layout, generous top whitespace.
- **Success icon:** green filled circle with white checkmark, checkmark stroke-draws in on entrance.
- Headline (H1, bold, centered) "Complaint Filed Successfully!" + subtext "Your report has been officially registered with the National Cyber Crime Portal."
- **Tracking number card:** dashed-border rounded card, caption "NCRP TRACKING NUMBER", large bold monospace value e.g. `ACK-2026-981042`, "Copy" button (icon+label chip) on the right — tapping copies to clipboard and shows a small toast ("Copied!").
- **"What happens next?" list:** numbered (1., 2., ...) plain-text steps, e.g. "NCRP will review the incident within 24–48 hours." / "Sathi will alert your linked bank to flag the fraud transaction."
- **Footer buttons:** "🔍 Track Status" (solid teal, primary) → Case Status screen; "Back to Home" (outline/ghost) → Assistant tab.

### 6.15 Case Status (My Cases → detail)
- Header "Case Status" + right-aligned "Listen" pill button (TTS reads the full status aloud).
- **Case summary card:** "CASE ID: CS-2026-98" + status pill (color-coded per §2.1 — In Progress/amber, Under Review/blue, Resolved/green, Action Needed/red), bold case title "Electricity Bill SMS Fraud", metadata line "Reported on Jan 24, 2026 • Lost Amount: ₹5,000".
- **Investigation Progress — vertical stepper:**
  - Completed steps: filled green circle w/ checkmark, connecting line solid.
  - Current step: filled blue/teal dot with pulsing ring, bold blue label, connecting line to it solid, line beyond it dashed/grey.
  - Future steps: hollow grey dashed circle, grey label.
  - Each step shows a short description + timestamp where applicable (e.g. "Under Investigation — Cyber Cell has identified the recipient wallet address. — Jan 25, 2026 • 11:30 AM").
  - Typical step set: Case Filed Successfully → Under Investigation → Resolved & Refunded.

### 6.16 Resolution Support
- Header "Resolution Support".
- **AI prompt card:** dark teal bubble, small avatar, "SATHI ASSISTANT" caption + bold question "Did you get your money back?"
- **Two large answer buttons side-by-side:** "✓ Yes, recovered" (outline, turns green-bordered/filled on selection) and "✕ No, still pending" (outline red text/icon, turns red-bordered on selection).
- **Escalation Options** (shown always, or specifically emphasized if "No" selected):
  - "**File an appeal (RBI Ombudsman)**" — document icon in blue circle, "Escalate bank delays directly to Reserve Bank of India." → deep-links to another guided/webview flow analogous to §6.12–6.13 for that portal.
  - "**Post publicly for attention**" — share/network icon in amber circle, "Publish to CyberSathi Feed to warn others and urge bank action." → opens the **Share Sheet** (§6.19) with explicit consent framing.

### 6.17 Scam Detail (Community / Defend)
- Header "Scam Detail" + flag icon (report-this-post) top right.
- **Category tag pill** (amber, "Electricity SMS Fraud") .
- **Audio evidence player card:** play/pause circular button + animated waveform bar + running timer, "Listen Full Case Summary" / "Generated by CyberSathi Sathi-AI" caption when idle.
- **Location line:** pin icon + "Reported from: Western Mumbai, MH".
- **Social-proof banner:** light-grey card, alert emoji, "Also reported by **412 other users** in this region" (bolded count in red/danger for emphasis).
- **Body text:** plain paragraph describing the scam pattern and a defensive tip.
- *(On the community feed list version, each entry is a condensed card with category pill, date/location, a quote-style excerpt, and — when audio exists — an inline mini player + "Suspect Number: +91 98765 XXXXX" (partially masked for privacy) + two chip buttons "🚩 I got this too (142)" and "Sounds Fake" for community verification/voting.)*

### 6.18 My Cases (list)
- Header "My Cases".
- Vertical list of case cards: leading icon in soft-grey rounded square (category-representative icon), title (bold), metadata "Lost: ₹X,XXX • Date", trailing status pill (color per §2.1).
- Tapping any row → Case Status detail (§6.15).

### 6.19 Share Flow (consent-gated)
- Triggered from "Post publicly for attention" or any explicit share action.
- **Bottom sheet, "Share Link"** — shows the shareable URL/preview in a copyable field (copy icon), then a horizontal row of destination targets: individual contacts (avatar + name, e.g. via device contacts with per-app badges like WhatsApp/LinkedIn/Instagram overlay), followed by app icons row: WhatsApp, Gmail, Instagram, Facebook, and (add for full coverage) **X/Twitter and Reddit** icons alongside the CyberSathi community feed itself as a first-class destination chip ("Post to CyberSathi Defend").
- **Explicit consent microcopy** above the destinations, required before the sheet's send actions are enabled: a short line such as "This will share your case category, city, and scam pattern — never your name, phone number, or financial details — with the destinations you choose." + a checkbox "I understand and consent to sharing this publicly" that must be checked to activate any share target.
- "Cancel" full-width ghost button at the bottom.
- Sharing to CyberSathi's own Defend feed publishes an anonymized card into §6.17's list.

### 6.20 Profile
- Header "Profile Settings".
- **Avatar circle** (initials, e.g. "AK"), name (bold), phone number (secondary text), centered.
- **Editable fields:** State/District (text row + pencil icon), App Language (dropdown showing current locale, e.g. "English (Default)" / "हिंदी").
- **Nav rows:** "⚙ Manage Permissions →" (routes back into a standalone version of §6.4's toggle list), "⊗ Data & Privacy →" (routes to a policy/consent-history screen).
- **Danger action:** "Log Out Account" — full-width, red outline button, bottom.

---

## 7. Category → Official Portal Routing Logic

The AI classification step (§6.9) must map detected fraud type to the correct filing destination. Build this as a lookup table the agent/backend can reference (values illustrative — confirm current live URLs at build time since government portal structures change):

| Detected Category | Primary Filing Destination | Notes |
|---|---|---|
| UPI/Wallet Payment Fraud, Card Fraud, Net-banking Fraud | National Cyber Crime Reporting Portal (NCRP) — Financial Fraud module | Time-sensitive; NCRP has a dedicated fast-track for financial fraud within the "golden hour" |
| Phishing SMS/Fake Utility-bill threats | NCRP — general cybercrime complaint | Include the SMS/link as evidence attachment |
| Fake Job Offer / Task Scam (e.g. Telegram) | NCRP — cybercrime complaint; optionally cross-file with state Cyber Cell | |
| Impersonation calls (govt./bank officials) | NCRP; escalate to 1930 helpline for financial recovery if money moved | Surface the 1930 number prominently as a call-to-action if funds were transferred within recent hours |
| Social media / identity impersonation | NCRP — Women/Child or general cybercrime section depending on nature | |
| Bank delay on refund/chargeback after fraud is filed | RBI Banking Ombudsman portal | Used in the Resolution Support escalation path (§6.16) |
| Uncertain / mixed signals | Present a "Not correct? Change category" picker (§6.9) before proceeding — never auto-file an unconfirmed category |

The "Filing Information" card copy (§6.9) should always name the specific portal and explain in one sentence why that's the right destination, so the user understands and trusts the routing before continuing.

---

## 8. Component Library (build these as reusable primitives first)

1. **PrimaryButton** (solid teal pill, disabled/enabled/pressed states, optional leading icon)
2. **SecondaryButton** (outline teal pill)
3. **GhostTextButton** (underlined text link)
4. **StatusPill** (color-coded per §2.1, small caps text)
5. **InfoBanner** (mint/amber variants, icon + bold title + description)
6. **SelectableCard** (radio-style, used for language + category picker)
7. **ToggleRow** (icon + title + description + switch)
8. **OTPInput** (N-box, auto-advance, paste support, error-shake state)
9. **ProgressStepHeader** ("Step X of 4" label + implicit linear progress)
10. **CarouselDots**
11. **ChatBubble** (AI vs. user variants, with optional TTS-play affordance)
12. **SuggestionChip**
13. **AudioPlayerInline** (play/pause, animated waveform, duration)
14. **VerticalStepper** (completed/active/future states, timestamp support)
15. **CaseListCard**
16. **BottomSheet** (generic container for disambiguation, recordings picker, share sheet)
17. **TabBar** (4 items, active-state pill/indicator)
18. **CaptchaField** (distorted-code display + refresh + validating input)
19. **WebviewFormMock** (header bar + field rows + type-in animation, for §6.12)
20. **Toast** (brief confirmation, e.g. "Copied!")

Build tokens (§2) into a central theme file first; every component above should consume tokens, not hard-coded values, so the whole app re-themes correctly when locale/dark-mode changes.

---

## 9. Accessibility

- Minimum touch target 44×44px on all interactive elements (buttons, chips, toggle rows).
- Color is never the *only* status signal — status pills carry text labels, not just color; error/success states pair color with an icon (✓ / ✕ / ⚠).
- All icon-only buttons (play/pause, copy, mic) need accessible labels in both locales.
- Support dynamic type scaling up to at least 130% without breaking layout (test OTP boxes and button labels specifically).
- Voice-first flows must always offer an equivalent text/tap path for users who can't or won't use the mic (already reflected in §6.7, §6.11, §6.13).
- Ensure Devanagari text has adequate line-height (Hindi glyphs are taller) — do not reuse tight Latin line-heights.

---

## 10. Recommended Build Order for the AI Agent

1. Set up theming: color tokens, type scale, spacing scale, two font families (Latin + Devanagari), locale-string loader.
2. Build the component library (§8) in isolation (Storybook-style or a simple component gallery screen) before wiring any real flow.
3. Build static screens in this order, wiring navigation only (no fake data logic yet): Splash → Onboarding 1–4 → Assistant Home → Voice Capture → Processing → Scam Analysis → Review Details → Portal Auto-fill → Final Verification → Success → Case Status → My Cases list → Resolution Support → Defend feed + Scam Detail → Profile.
4. Layer in the animation/motion pass (§3) screen by screen — idle mic pulse, processing checklist, OTP interactions, stepper fills, share-sheet spring — once static layouts are approved.
5. Wire mock state/data: a single local JSON "case object" that flows through Voice Capture → Processing → Review → Auto-fill → Success → Case Status, so the same user-entered numbers appear consistently end-to-end.
6. Implement the bottom-sheet disambiguation flows (call-number picker, recordings picker) as they branch off Processing.
7. Implement the Share flow with the explicit consent checkbox gating all destination buttons.
8. Add the language toggle (Profile + onboarding) last, and verify every screen re-renders correctly in Hindi, including the webview mock and captcha copy.
9. Do an accessibility pass (§9) and a `prefers-reduced-motion` fallback pass on all animations.
10. Final polish pass: empty states, loading skeletons, and error states (OTP wrong, captcha wrong, no network) for every screen that hits mock "network."

---

*End of specification.*
