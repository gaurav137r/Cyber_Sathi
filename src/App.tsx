import { useState, useEffect, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Screen =
  | "splash"
  | "onboard-language"
  | "onboard-how"
  | "onboard-permissions"
  | "onboard-otp"
  | "home"
  | "listening"
  | "processing"
  | "scam-analysis"
  | "review-details"
  | "portal-autofill"
  | "final-verification"
  | "success"
  | "my-cases"
  | "case-status"
  | "defend"
  | "profile";

type Tab = "home" | "my-cases" | "defend" | "profile";

// ─── Colors (token references) ────────────────────────────────────────────────
const C = {
  teal900: "#0B2E2E",
  teal700: "#0F4C4C",
  teal600: "#146B66",
  teal500: "#1D8577",
  mint300: "#7FD1C0",
  mint100: "#E3F3EF",
  bgCanvas: "#F4F5F3",
  white: "#FFFFFF",
  textPrimary: "#16211F",
  textSecondary: "#5B6B68",
  warning: "#FCEBB6",
  warningIcon: "#F0A93A",
  danger: "#E15347",
  success: "#3FAE5C",
  successBg: "#DFF3E4",
  divider: "#E6E8E6",
};

// ─── Demo Data ────────────────────────────────────────────────────────────────
const DEMO_OTP = "482951";
const DEMO_CAPTCHA = "W7K9P";
const DEMO_TRACKING = "ACK-2026-981042";

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState<Screen>("splash");
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [language, setLanguage] = useState<"en" | "hi">("en");
  const [howSlide, setHowSlide] = useState(0);

  // Navigate helper
  const go = (s: Screen) => setScreen(s);

  // Tab navigation
  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    if (tab === "home") go("home");
    else if (tab === "my-cases") go("my-cases");
    else if (tab === "defend") go("defend");
    else if (tab === "profile") go("profile");
  };

  // Show tab bar on main screens
  const showTabBar = ["home", "my-cases", "defend", "profile"].includes(screen);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#1a2e2e",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Noto Sans', 'Noto Sans Devanagari', sans-serif",
      }}
    >
      {/* Mobile frame */}
      <div
        style={{
          width: 390,
          height: 844,
          background: C.bgCanvas,
          borderRadius: 44,
          overflow: "hidden",
          boxShadow: "0 40px 120px rgba(0,0,0,0.6), 0 0 0 12px #1a1a1a, 0 0 0 14px #333",
          position: "relative",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Status bar */}
        <div
          style={{
            height: 44,
            background: screen.startsWith("onboard") || screen === "splash" || screen === "listening" || screen === "processing" ? C.teal900 : C.bgCanvas,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 24px",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: screen.startsWith("onboard") || screen === "splash" || screen === "listening" || screen === "processing" ? "rgba(255,255,255,0.8)" : C.textSecondary }}>9:41</span>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {["📶", "🔋"].map((e, i) => (
              <span key={i} style={{ fontSize: 11 }}>{e}</span>
            ))}
          </div>
        </div>

        {/* Screen content */}
        <div style={{ flex: 1, overflow: "hidden", position: "relative", display: "flex", flexDirection: "column" }}>
          {screen === "splash" && <SplashScreen onDone={() => go("onboard-language")} />}
          {screen === "onboard-language" && <LanguageScreen language={language} setLanguage={setLanguage} onNext={() => go("onboard-how")} />}
          {screen === "onboard-how" && <HowScreen slide={howSlide} setSlide={setHowSlide} onNext={() => go("onboard-permissions")} language={language} />}
          {screen === "onboard-permissions" && <PermissionsScreen onNext={() => go("onboard-otp")} language={language} />}
          {screen === "onboard-otp" && <OTPScreen onNext={() => go("home")} language={language} isOnboarding />}
          {screen === "home" && <HomeScreen onStartReport={() => go("listening")} onCaseStatus={() => go("case-status")} language={language} />}
          {screen === "listening" && <ListeningScreen onDone={() => go("processing")} onBack={() => go("home")} />}
          {screen === "processing" && <ProcessingScreen onDone={() => go("scam-analysis")} />}
          {screen === "scam-analysis" && <ScamAnalysisScreen onNext={() => go("review-details")} onBack={() => go("home")} />}
          {screen === "review-details" && <ReviewDetailsScreen onNext={() => go("portal-autofill")} onBack={() => go("scam-analysis")} />}
          {screen === "portal-autofill" && <PortalAutofillScreen onNext={() => go("final-verification")} />}
          {screen === "final-verification" && <FinalVerificationScreen onNext={() => go("success")} />}
          {screen === "success" && <SuccessScreen onTrack={() => go("case-status")} onHome={() => { setActiveTab("home"); go("home"); }} />}
          {screen === "my-cases" && <MyCasesScreen onCase={() => go("case-status")} />}
          {screen === "case-status" && <CaseStatusScreen onBack={() => go("my-cases")} />}
          {screen === "defend" && <DefendScreen />}
          {screen === "profile" && <ProfileScreen language={language} setLanguage={setLanguage} />}
        </div>

        {/* Bottom tab bar */}
        {showTabBar && (
          <TabBar active={activeTab} onSwitch={switchTab} />
        )}

        {/* Home indicator */}
        <div style={{ height: 24, background: showTabBar ? C.white : (screen === "splash" || screen === "listening" || screen === "processing" ? C.teal900 : C.bgCanvas), display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 134, height: 5, background: showTabBar ? "#000" : "rgba(255,255,255,0.3)", borderRadius: 3, opacity: 0.2 }} />
        </div>
      </div>
    </div>
  );
}

// ─── Splash ───────────────────────────────────────────────────────────────────

function SplashScreen({ onDone }: { onDone: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setTimeout(() => setVisible(true), 100);
    const timer = setTimeout(onDone, 2800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      onClick={onDone}
      style={{
        flex: 1,
        background: C.teal900,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
        cursor: "pointer",
      }}
    >
      {/* Animated blobs */}
      <FloatingBlobs />

      {/* Logo content */}
      <div style={{ position: "relative", zIndex: 2, textAlign: "center", padding: "0 32px", transition: "opacity 0.5s, transform 0.5s", opacity: visible ? 1 : 0, transform: visible ? "scale(1)" : "scale(0.9)" }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🛡️</div>
        <h1 style={{
          fontFamily: "'Poppins', sans-serif",
          fontSize: 38,
          fontWeight: 800,
          color: C.white,
          margin: "0 0 8px",
          letterSpacing: "-0.5px",
        }}>
          CyberSathi
        </h1>
        <p style={{ fontSize: 11, fontWeight: 600, color: C.mint300, letterSpacing: "0.2em", textTransform: "uppercase", margin: "0 0 16px" }}>
          YOUR VOICE AGAINST SCAMS
        </p>
        <div style={{ width: 60, height: 2, background: `linear-gradient(90deg, ${C.mint300}, transparent)`, margin: "0 auto 20px", borderRadius: 1 }} />
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", fontStyle: "italic", transition: "opacity 0.5s", transitionDelay: "0.3s", opacity: visible ? 1 : 0 }}>
          "Speak, we are listening"
        </p>
      </div>

      <div style={{ position: "absolute", bottom: 40, left: 0, right: 0, textAlign: "center", opacity: 0.4 }}>
        <div style={{ width: 20, height: 20, border: `2px solid ${C.mint300}`, borderRadius: "50%", margin: "0 auto", animation: "pulse 1.5s infinite" }} />
      </div>

      <style>{`@keyframes pulse { 0%,100% { transform:scale(1);opacity:0.4 } 50% { transform:scale(1.3);opacity:0.8 } }`}</style>
    </div>
  );
}

function FloatingBlobs() {
  return (
    <>
      <style>{`
        @keyframes float1 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(6px,-8px)} }
        @keyframes float2 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-8px,6px)} }
        @keyframes float3 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(5px,7px)} }
      `}</style>
      {[
        { top: -60, right: -40, size: 200, color: C.teal500, delay: "0s", anim: "float1" },
        { top: 40, right: 60, size: 120, color: C.mint300, delay: "0.5s", anim: "float2" },
        { top: -20, right: 100, size: 80, color: C.teal700, delay: "1s", anim: "float3" },
      ].map((b, i) => (
        <div key={i} style={{
          position: "absolute",
          top: b.top,
          right: b.right,
          width: b.size,
          height: b.size,
          borderRadius: "50%",
          background: `radial-gradient(circle at 40% 40%, ${b.color}80, ${b.color}20)`,
          animationName: b.anim,
          animationDuration: `${6 + i}s`,
          animationDelay: b.delay,
          animationTimingFunction: "ease-in-out",
          animationIterationCount: "infinite",
        }} />
      ))}
    </>
  );
}

// ─── Language ─────────────────────────────────────────────────────────────────

function LanguageScreen({ language, setLanguage, onNext }: { language: string; setLanguage: (l: "en" | "hi") => void; onNext: () => void }) {
  const langs = [
    { key: "en", label: "English", sub: "Primary Language" },
    { key: "hi", label: "Hindi / हिंदी", sub: "Hindi Support" },
    { key: "bn", label: "Bengali / বাংলা", sub: "Bengali Support" },
  ];

  return (
    <OnboardShell step={1} title="Language" subtitle="Select your preferred language">
      <InfoBanner text="We support voice inputs in multiple regional languages to make reporting seamless." />
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 20 }}>
        {langs.map((l) => (
          <SelectableCard
            key={l.key}
            selected={language === l.key}
            onSelect={() => setLanguage(l.key as "en" | "hi")}
            label={l.label}
            sub={l.sub}
          />
        ))}
      </div>
      <div style={{ marginTop: "auto", paddingTop: 32 }}>
        <PrimaryButton label="Confirm Language" disabled={!language} onClick={onNext} />
      </div>
    </OnboardShell>
  );
}

// ─── How it works ─────────────────────────────────────────────────────────────

const HOW_SLIDES = [
  { icon: "🎙️", title: "Just speak, no typing needed", desc: "Simply explain the incident in your own words. Sathi is trained to parse fraud descriptions and capture important facts automatically." },
  { icon: "🔒", title: "Your data is protected", desc: "Your incident details stay private and isolated. Sathi processes them only to create your report and never stores or shares your data." },
  { icon: "🤝", title: "Let's defeat cyber crime together", desc: "You are backed by a strong community that intends to help people stand against cyber crimes and raise their voice." },
];

function HowScreen({ slide, setSlide, onNext, language }: { slide: number; setSlide: (n: number) => void; onNext: () => void; language: string }) {
  const s = HOW_SLIDES[slide];

  return (
    <OnboardShell step={2} title="How Sathi Works" subtitle="Learn what makes Sathi different">
      <div style={{
        background: C.white,
        borderRadius: 20,
        padding: "32px 24px",
        textAlign: "center",
        boxShadow: `0 8px 24px rgba(11,46,46,0.08)`,
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        minHeight: 280,
      }}>
        <div style={{ fontSize: 64 }}>{s.icon}</div>
        <h2 style={{ fontFamily: "'Poppins', sans-serif", fontSize: 20, fontWeight: 700, color: C.textPrimary, margin: 0 }}>{s.title}</h2>
        <p style={{ fontSize: 14, color: C.textSecondary, lineHeight: 1.6, margin: 0 }}>{s.desc}</p>
      </div>

      {/* Dots */}
      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 20 }}>
        {HOW_SLIDES.map((_, i) => (
          <div key={i} onClick={() => setSlide(i)} style={{
            height: 8,
            width: i === slide ? 24 : 8,
            background: i === slide ? C.teal600 : "#ccc",
            borderRadius: 4,
            cursor: "pointer",
            transition: "all 0.3s ease",
          }} />
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
        <GhostButton label="Skip" onClick={onNext} />
        <PrimaryButton
          label={slide === 2 ? "Continue" : "Next Slide →"}
          onClick={() => slide === 2 ? onNext() : setSlide(slide + 1)}
          style={{ minWidth: 140 }}
        />
      </div>
    </OnboardShell>
  );
}

// ─── Permissions ──────────────────────────────────────────────────────────────

function PermissionsScreen({ onNext, language }: { onNext: () => void; language: string }) {
  const [perms, setPerms] = useState({ callLogs: false, sms: false, mic: true, recordings: true });

  const toggle = (key: keyof typeof perms) => setPerms(p => ({ ...p, [key]: !p[key] }));

  const rows = [
    { key: "callLogs" as const, icon: "📞", title: "Call Logs", desc: "Used to cross-verify and flag active spam numbers." },
    { key: "sms" as const, icon: "💬", title: "SMS Messages", desc: "Scans fake bank alerts and dangerous URLs." },
    { key: "mic" as const, icon: "🎙️", title: "Microphone", desc: "Allows you to speak and explain incidents directly." },
    { key: "recordings" as const, icon: "🎵", title: "Call Recordings", desc: "Turn on recording calls from unknown numbers." },
  ];

  return (
    <OnboardShell step={3} title="Permissions" subtitle="Grant required access to proceed">
      <div style={{ background: C.mint100, borderRadius: 16, padding: "14px 16px", display: "flex", gap: 12, alignItems: "center", marginBottom: 20 }}>
        <div style={{ width: 40, height: 40, background: C.teal600, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 18 }}>🛡️</div>
        <div>
          <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: C.textPrimary }}>Permissions secure your identity</p>
          <p style={{ margin: 0, fontSize: 12, color: C.textSecondary }}>These help verify scam logs automatically</p>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map(r => (
          <ToggleRow key={r.key} icon={r.icon} title={r.title} desc={r.desc} on={perms[r.key]} onToggle={() => toggle(r.key)} />
        ))}
      </div>

      <div style={{ marginTop: "auto", paddingTop: 24, display: "flex", flexDirection: "column", gap: 12 }}>
        <PrimaryButton label="🛡 Allow & Continue" onClick={onNext} />
        <GhostButton label="Do this later" onClick={onNext} style={{ textAlign: "center" }} />
      </div>
    </OnboardShell>
  );
}

// ─── OTP Screen ───────────────────────────────────────────────────────────────

function OTPScreen({ onNext, language, isOnboarding = false }: { onNext: () => void; language: string; isOnboarding?: boolean }) {
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [showDemo, setShowDemo] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);
  const [countdown, setCountdown] = useState(45);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    // Show demo popup after 1.2s
    const t = setTimeout(() => setShowDemo(true), 1200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (countdown > 0) {
      const t = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [countdown]);

  const handleAutoFill = () => {
    setShowDemo(false);
    setAutoFilling(true);
    const otp = DEMO_OTP.split("");
    otp.forEach((d, i) => {
      setTimeout(() => {
        setDigits(prev => {
          const next = [...prev];
          next[i] = d;
          return next;
        });
        if (i < 5) inputRefs.current[i + 1]?.focus();
      }, i * 180);
    });
    setTimeout(() => setAutoFilling(false), otp.length * 180 + 300);
  };

  const handleDigit = (i: number, val: string) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...digits];
    next[i] = val;
    setDigits(next);
    if (val && i < 5) inputRefs.current[i + 1]?.focus();
  };

  const filled = digits.every(d => d !== "");

  const content = (
    <>
      {/* Lock icon */}
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ width: 72, height: 72, borderRadius: "50%", background: `radial-gradient(circle, ${C.mint100}, ${C.mint300}40)`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 32, boxShadow: `0 0 32px ${C.teal500}30` }}>
          🔐
        </div>
      </div>

      {/* Phone card */}
      <div style={{ background: C.white, borderRadius: 16, padding: "14px 20px", display: "flex", alignItems: "center", gap: 12, marginBottom: 24, boxShadow: `0 4px 12px rgba(11,46,46,0.08)` }}>
        <span style={{ fontSize: 24 }}>🇮🇳</span>
        <div>
          <p style={{ margin: 0, fontWeight: 600, color: C.textPrimary }}>+91 98765 43210</p>
          <p style={{ margin: 0, fontSize: 12, color: C.textSecondary }}>OTP sent to your registered number</p>
        </div>
      </div>

      {/* OTP boxes */}
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 20 }}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={el => { inputRefs.current[i] = el; }}
            value={d}
            onChange={e => handleDigit(i, e.target.value)}
            maxLength={1}
            style={{
              width: 46,
              height: 54,
              borderRadius: 12,
              border: `2px solid ${d ? C.teal600 : C.divider}`,
              background: C.white,
              fontSize: 22,
              fontWeight: 700,
              textAlign: "center",
              color: C.textPrimary,
              fontFeatureSettings: "'tnum'",
              outline: "none",
              transition: "border-color 0.15s, transform 0.12s",
              transform: autoFilling && d ? "scale(1.08)" : "scale(1)",
            }}
          />
        ))}
      </div>

      {/* Trust banner */}
      <div style={{ background: C.mint100, borderRadius: 12, padding: "10px 14px", display: "flex", gap: 8, alignItems: "center", marginBottom: 24 }}>
        <span style={{ fontSize: 14 }}>🛡️</span>
        <div>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: C.teal600 }}>Verified report environment</p>
          <p style={{ margin: 0, fontSize: 11, color: C.textSecondary }}>We confirm numbers to maintain scam data legitimacy.</p>
        </div>
      </div>

      <PrimaryButton label="Verify & Continue" disabled={!filled} onClick={onNext} />

      <p style={{ textAlign: "center", fontSize: 12, color: C.textSecondary, marginTop: 14 }}>
        Didn't get code?{" "}
        <span style={{ color: countdown === 0 ? C.teal600 : C.textSecondary, fontWeight: 600, cursor: countdown === 0 ? "pointer" : "default" }}>
          {countdown === 0 ? "Resend OTP" : `Resend OTP in ${countdown}s`}
        </span>
      </p>

      {/* Demo OTP popup */}
      {showDemo && (
        <DemoPopup
          title="📱 Demo: OTP Received"
          message={`Your CyberSathi verification code is`}
          code={DEMO_OTP}
          hint="Tap to auto-fill"
          onFill={handleAutoFill}
          onDismiss={() => setShowDemo(false)}
        />
      )}
    </>
  );

  if (isOnboarding) {
    return (
      <OnboardShell step={4} title="OTP Verification" subtitle="Complete the final registration step">
        {content}
      </OnboardShell>
    );
  }

  return (
    <ScreenShell title="OTP Verification" subtitle="Enter verification code" onBack={() => {}}>
      {content}
    </ScreenShell>
  );
}

// ─── Home / Assistant ─────────────────────────────────────────────────────────

function HomeScreen({ onStartReport, onCaseStatus, language }: { onStartReport: () => void; onCaseStatus: () => void; language: string }) {
  const [dismissed, setDismissed] = useState(false);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setPulse(p => !p), 1100);
    return () => clearInterval(t);
  }, []);

  const shortcuts = [
    { icon: "💸", label: "Lost Money", sub: "Unauthorized deduction" },
    { icon: "📵", label: "Spam Caller", sub: "Threats or fake rewards" },
    { icon: "🌐", label: "Fake Website", sub: "Phishing links" },
    { icon: "📞", label: "Fake Calls", sub: "Impersonating known ones" },
  ];

  return (
    <div style={{ flex: 1, overflowY: "auto", background: C.bgCanvas, padding: "0 20px 20px" }}>
      {/* Scam alert banner */}
      {!dismissed && (
        <div style={{ background: C.warning, borderRadius: 14, padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 16, marginTop: 8 }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#7a4d00" }}>Scam Alert: Electricity Bill SMS</p>
            <p style={{ margin: 0, fontSize: 11, color: "#7a4d00" }}>Be careful of text warnings threatening utility disconnection.</p>
          </div>
          <span onClick={() => setDismissed(true)} style={{ cursor: "pointer", fontSize: 14, color: "#7a4d00", opacity: 0.6 }}>✕</span>
        </div>
      )}

      {/* Prompt card */}
      <div style={{ background: C.mint100, borderRadius: 20, padding: "18px 20px", display: "flex", gap: 14, alignItems: "center", marginBottom: 24 }}>
        <div style={{ width: 48, height: 48, background: C.teal600, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>🎙️</div>
        <div>
          <p style={{ margin: "0 0 2px", fontWeight: 600, color: C.textPrimary, fontSize: 14 }}>Tap and tell Sathi what happened</p>
          <p style={{ margin: 0, fontSize: 12, color: C.textSecondary }}>Explain the cyber fraud incident in simple {language === "hi" ? "Hindi" : "English"}</p>
        </div>
      </div>

      {/* Mic orb */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 28 }}>
        <div style={{ position: "relative", marginBottom: 12 }}>
          {/* Pulse rings */}
          <div style={{
            position: "absolute", inset: -20,
            borderRadius: "50%",
            border: `2px solid ${C.teal500}`,
            opacity: pulse ? 0.15 : 0.35,
            transform: pulse ? "scale(1.15)" : "scale(1)",
            transition: "opacity 1.1s ease, transform 1.1s ease",
          }} />
          <div style={{
            position: "absolute", inset: -10,
            borderRadius: "50%",
            border: `2px solid ${C.teal600}`,
            opacity: pulse ? 0.2 : 0.4,
            transform: pulse ? "scale(1.08)" : "scale(1)",
            transition: "opacity 1.1s ease, transform 1.1s ease",
          }} />
          {/* Main orb */}
          <button
            onClick={onStartReport}
            style={{
              width: 96,
              height: 96,
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${C.teal600}, ${C.teal500})`,
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
              boxShadow: `0 8px 32px ${C.teal600}60`,
              transform: "scale(1)",
              transition: "transform 0.15s",
            }}
            onMouseDown={e => (e.currentTarget.style.transform = "scale(0.94)")}
            onMouseUp={e => (e.currentTarget.style.transform = "scale(1)")}
          >
            🎙️
          </button>
        </div>
        <p style={{ fontSize: 12, color: C.textSecondary, margin: 0 }}>Tap Center Orb to Speak</p>
      </div>

      {/* Shortcuts */}
      <p style={{ fontSize: 11, fontWeight: 600, color: C.textSecondary, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 12px" }}>Common Scam Topics</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {shortcuts.map((s, i) => (
          <div key={i} onClick={onStartReport} style={{
            background: C.white,
            borderRadius: 16,
            padding: "14px 16px",
            cursor: "pointer",
            boxShadow: `0 4px 12px rgba(11,46,46,0.07)`,
            transition: "transform 0.15s",
          }}
            onMouseDown={e => (e.currentTarget.style.transform = "scale(0.97)")}
            onMouseUp={e => (e.currentTarget.style.transform = "scale(1)")}
          >
            <div style={{ fontSize: 28, marginBottom: 6 }}>{s.icon}</div>
            <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600, color: C.textPrimary }}>{s.label}</p>
            <p style={{ margin: 0, fontSize: 11, color: C.textSecondary }}>{s.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Listening ────────────────────────────────────────────────────────────────

function ListeningScreen({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [words, setWords] = useState<string[]>([]);
  const TRANSCRIPT = ["Yesterday", "I", "received", "a", "call", "from", "+91-98765-00021", "claiming", "to", "be", "from", "HDFC", "Bank...", "They", "asked", "for", "my", "UPI", "PIN", "and", "transferred", "₹15,000."];

  useEffect(() => {
    const timers = TRANSCRIPT.map((w, i) =>
      setTimeout(() => {
        setWords(prev => [...prev, w]);
      }, i * 350 + 600)
    );

    return () => {
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div style={{ flex: 1, background: C.teal900, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
      {/* Header */}
      <div style={{ width: "100%", padding: "16px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.1)", borderRadius: 20, padding: "6px 14px" }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.danger, animation: "blink 1s infinite" }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: C.white, letterSpacing: "0.08em" }}>LISTENING LIVE</span>
        </div>
        <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
      </div>
      <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, margin: "0 0 32px" }}>Speak clearly into your microphone.</p>

      {/* Sonar orb */}
      <div style={{ position: "relative", marginBottom: 32 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            position: "absolute",
            borderRadius: "50%",
            border: `2px solid ${C.mint300}`,
            opacity: 0,
            animation: `sonar 2.4s ${i * 0.8}s ease-out infinite`,
            inset: -(40 + i * 20),
          }} />
        ))}
        <style>{`@keyframes sonar { 0%{opacity:0.6;transform:scale(0.8)} 100%{opacity:0;transform:scale(1.6)} }`}</style>
        <div style={{
          width: 100, height: 100, borderRadius: "50%",
          background: `linear-gradient(135deg, ${C.teal500}, ${C.mint300})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 40, boxShadow: `0 0 48px ${C.mint300}50`,
        }}>🎙️</div>
      </div>

      {/* Live caption */}
      <div style={{
        margin: "0 20px",
        background: "rgba(255,255,255,0.08)",
        backdropFilter: "blur(12px)",
        borderRadius: 16,
        padding: "16px 18px",
        minHeight: 80,
        width: "calc(100% - 40px)",
      }}>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 8px" }}>Live Transcript</p>
        <p style={{ color: C.white, fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          "{words.join(" ")}{words.length > 0 && words.length < TRANSCRIPT.length && <span style={{ opacity: 0.4, animation: "blink 1s infinite" }}>|</span> }"
        </p>
      </div>

      {/* Stop button */}
      <div style={{ marginTop: "auto", marginBottom: 24, display: "flex", gap: 12 }}>
        <button onClick={onBack} style={{ padding: "12px 20px", borderRadius: 28, border: `1px solid rgba(255,255,255,0.2)`, background: "transparent", color: C.white, fontSize: 13, cursor: "pointer" }}>
          ⌨️ Type instead
        </button>
        <button onClick={onDone} style={{
          padding: "12px 28px", borderRadius: 28, background: C.danger,
          border: "none", color: C.white, fontSize: 14, fontWeight: 700, cursor: "pointer",
        }}>
          ■ Stop Listening
        </button>
      </div>
    </div>
  );
}

// ─── Processing ───────────────────────────────────────────────────────────────

function ProcessingScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(-1);
  const [showSheet, setShowSheet] = useState(false);

  const steps = [
    "Transcribed voice recording",
    "Checking suspicious messages",
    "Checking recent caller identity...",
  ];

  useEffect(() => {
    [0, 1, 2].forEach(i => setTimeout(() => setStep(i), 1200 + i * 1400));
    setTimeout(() => setShowSheet(true), 1200 + 2 * 1400 + 600);
  }, []);

  return (
    <div style={{ flex: 1, background: C.teal900, display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 20px", position: "relative" }}>
      {/* Rotating orb */}
      <div style={{ position: "relative", marginBottom: 28 }}>
        <div style={{
          width: 96, height: 96, borderRadius: "50%",
          background: `conic-gradient(${C.mint300}, ${C.teal500}, ${C.mint300})`,
          animation: "spinOrb 4s linear infinite",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{ width: 68, height: 68, borderRadius: "50%", background: C.teal900, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>⚙️</div>
        </div>
        <style>{`@keyframes spinOrb { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
      </div>

      <h2 style={{ fontFamily: "'Poppins',sans-serif", color: C.white, fontSize: 20, fontWeight: 700, margin: "0 0 8px", textAlign: "center" }}>Understanding what happened</h2>
      <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, margin: "0 0 36px", textAlign: "center" }}>Sathi is extracting fraud indicators from your statement.</p>

      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
        {steps.map((s, i) => (
          <ChecklistItem key={i} label={s} state={i < step ? "done" : i === step ? "active" : "pending"} />
        ))}
      </div>

      {/* Disambiguation bottom sheet */}
      {showSheet && (
        <DisambiguationSheet onSelect={() => { setShowSheet(false); setTimeout(onDone, 800); }} />
      )}
    </div>
  );
}

function ChecklistItem({ label, state }: { label: string; state: "done" | "active" | "pending" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{
        width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
        background: state === "done" ? C.teal600 : "transparent",
        border: `2px ${state === "pending" ? "dashed" : "solid"} ${state === "done" ? C.teal600 : state === "active" ? C.mint300 : "rgba(255,255,255,0.2)"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13,
        transition: "all 0.4s ease",
      }}>
        {state === "done" ? "✓" : state === "active" ? <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.mint300, animation: "blink 1s infinite" }} /> : ""}
      </div>
      <span style={{ color: state === "pending" ? "rgba(255,255,255,0.3)" : C.white, fontSize: 14, transition: "color 0.3s" }}>{label}</span>
    </div>
  );
}

function DisambiguationSheet({ onSelect }: { onSelect: () => void }) {
  const numbers = [
    { num: "+91 98765 00021", name: "Unknown", scam: true, count: 28 },
    { num: "+91 22 6648 7777", name: "HDFC Bank", scam: false, count: 0 },
  ];

  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", animation: "fadeIn 0.3s ease" }}>
      <div style={{ background: C.white, borderRadius: "24px 24px 0 0", width: "100%", padding: "24px 20px" }}>
        <div style={{ width: 40, height: 4, background: "#ddd", borderRadius: 2, margin: "0 auto 20px" }} />
        <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: C.textPrimary }}>Which number called you?</h3>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: C.textSecondary }}>Sathi detected these numbers from your statement</p>
        {numbers.map((n, i) => (
          <div key={i} onClick={onSelect} style={{
            background: C.bgCanvas,
            borderRadius: 14,
            padding: "14px 16px",
            marginBottom: 10,
            cursor: "pointer",
            border: `1px solid ${C.divider}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <div>
              <p style={{ margin: "0 0 2px", fontWeight: 600, color: C.textPrimary, fontSize: 14 }}>{n.num}</p>
              <p style={{ margin: 0, fontSize: 12, color: C.textSecondary }}>{n.name}</p>
            </div>
            {n.scam && (
              <span style={{ background: "#FEE2E2", color: C.danger, fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 8, letterSpacing: "0.03em" }}>
                Reported {n.count}+ times
              </span>
            )}
          </div>
        ))}
      </div>
      <style>{`@keyframes fadeIn { from{opacity:0} to{opacity:1} }`}</style>
    </div>
  );
}

// ─── Scam Analysis ────────────────────────────────────────────────────────────

function ScamAnalysisScreen({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setTimeout(() => setRevealed(true), 400);
  }, []);

  return (
    <ScreenShell title="Scam Analysis" subtitle="Sathi has categorised your incident" onBack={onBack}>
      <div style={{ flex: 1, padding: "0 0 20px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Result card */}
        <div style={{
          border: `2px solid ${C.warningIcon}`,
          background: C.warning,
          borderRadius: 20,
          padding: "24px 20px",
          textAlign: "center",
          transition: "opacity 0.4s, transform 0.4s",
          opacity: revealed ? 1 : 0,
          transform: revealed ? "scale(1)" : "scale(0.9)",
        }}>
          <div style={{ width: 56, height: 56, background: C.warningIcon, borderRadius: "50%", margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>⚠️</div>
          <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#7a4d00" }}>DETECTED CATEGORY</p>
          <h2 style={{ fontFamily: "'Poppins',sans-serif", margin: 0, fontSize: 22, fontWeight: 700, color: C.textPrimary }}>UPI Payment Fraud</h2>
        </div>

        {/* Filing information */}
        <div style={{ background: C.white, borderRadius: 20, padding: "20px", boxShadow: `0 4px 16px rgba(11,46,46,0.08)` }}>
          <h3 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 700, color: C.textPrimary }}>Filing Information</h3>
          <p style={{ margin: "0 0 14px", fontSize: 13, color: C.textSecondary, lineHeight: 1.6 }}>
            This will be filed with the <strong>National Cyber Crime Reporting Portal (NCRP)</strong> — Financial Fraud module, which has a dedicated fast-track for UPI fraud within the golden hour.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <span style={{ fontSize: 13 }}>❓</span>
            <span style={{ fontSize: 13, color: C.teal600, fontWeight: 600 }}>Not correct? Change category</span>
          </div>
        </div>
      </div>
      <PrimaryButton label="Continue →" onClick={onNext} />
    </ScreenShell>
  );
}

// ─── Review Details ───────────────────────────────────────────────────────────

function ReviewDetailsScreen({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const fields = [
    { label: "SCAMMER PHONE NUMBER", value: "+91 98765 00021" },
    { label: "AMOUNT LOST (₹)", value: "₹15,000" },
    { label: "DATE & TIME", value: "Aug 30, 2026 • 2:43 PM" },
    { label: "BANK / APP USED", value: "PhonePe (HDFC Bank)" },
    { label: "BRIEF DESCRIPTION", value: "Caller claimed to be from HDFC Bank, requested UPI PIN for \"account verification\", transferred funds." },
  ];

  return (
    <ScreenShell title="Review Details" subtitle="Ensure the information is completely correct" onBack={onBack}>
      {/* Audio summary */}
      <div style={{ background: C.mint100, borderRadius: 14, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <div style={{ width: 36, height: 36, background: C.teal600, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>▶</div>
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.teal600 }}>Listen to Summary</p>
          <p style={{ margin: 0, fontSize: 11, color: C.textSecondary }}>Hear the auto-generated voice report</p>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 0, background: C.white, borderRadius: 16, overflow: "hidden", boxShadow: `0 4px 16px rgba(11,46,46,0.08)`, marginBottom: 20 }}>
        {fields.map((f, i) => (
          <div key={i} style={{ padding: "14px 16px", borderBottom: i < fields.length - 1 ? `1px solid ${C.divider}` : "none", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: "0 0 2px", fontSize: 10, fontWeight: 700, color: C.textSecondary, letterSpacing: "0.08em", textTransform: "uppercase" }}>{f.label}</p>
              <p style={{ margin: 0, fontSize: 13, color: C.textPrimary, lineHeight: 1.5 }}>{f.value}</p>
            </div>
            <span style={{ color: C.teal600, fontSize: 14, cursor: "pointer", marginLeft: 8 }}>✏️</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <SecondaryButton label="+ Add More Details" onClick={() => {}} />
        <PrimaryButton label="✓ Looks Right, Continue" onClick={onNext} />
      </div>
    </ScreenShell>
  );
}

// ─── Portal Autofill ──────────────────────────────────────────────────────────

function PortalAutofillScreen({ onNext }: { onNext: () => void }) {
  const [progress, setProgress] = useState(0);
  const [filledFields, setFilledFields] = useState<number[]>([]);

  const fields = [
    { label: "Category of Complaint", value: "UPI Payment Fraud" },
    { label: "Suspect Mobile Number", value: "+91 98765 00021" },
    { label: "Date of Incident", value: "30/08/2026" },
    { label: "Amount Involved (₹)", value: "15,000" },
    { label: "Platform / App Used", value: "PhonePe" },
  ];

  useEffect(() => {
    const total = 5000;
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, (elapsed / total) * 100);
      setProgress(pct);
      if (pct >= 100) clearInterval(interval);
    }, 50);

    fields.forEach((_, i) => {
      setTimeout(() => setFilledFields(prev => [...prev, i]), 800 + i * 900);
    });

    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: C.bgCanvas }}>
      {/* Progress header */}
      <div style={{ background: C.teal900, padding: "12px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ color: C.white, fontSize: 12, fontWeight: 600 }}>Auto-filling on cybercrime.gov.in…</span>
          <span style={{ color: C.mint300, fontSize: 12, fontWeight: 700 }}>{Math.round(progress)}%</span>
        </div>
        <div style={{ height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${progress}%`, background: `linear-gradient(90deg, ${C.teal500}, ${C.mint300})`, transition: "width 0.1s linear", borderRadius: 2 }} />
        </div>
      </div>

      {/* Mock portal content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        {/* Portal header */}
        <div style={{ background: C.white, borderRadius: 14, padding: "14px 16px", marginBottom: 16, display: "flex", gap: 10, alignItems: "center", boxShadow: `0 2px 8px rgba(11,46,46,0.06)` }}>
          <span style={{ fontSize: 24 }}>🏛️</span>
          <div>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: C.teal600, letterSpacing: "0.06em" }}>NATIONAL CYBER CRIME PORTAL</p>
            <p style={{ margin: 0, fontSize: 10, color: C.textSecondary }}>Government of India • Official Submission</p>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {fields.map((f, i) => (
            <AutofillField key={i} label={f.label} value={f.value} filled={filledFields.includes(i)} />
          ))}
        </div>

        {/* Trust banner */}
        <div style={{ background: "#FFFBEB", border: `1px solid ${C.warningIcon}30`, borderRadius: 12, padding: "12px 14px", display: "flex", gap: 8, alignItems: "flex-start", marginTop: 16 }}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>🔒</span>
          <div>
            <p style={{ margin: "0 0 2px", fontSize: 12, fontWeight: 700, color: "#7a4d00" }}>Sathi is auto-filling this securely.</p>
            <p style={{ margin: 0, fontSize: 11, color: "#7a4d00" }}>Nothing will be submitted without your explicit confirmation on the next screen.</p>
          </div>
        </div>
      </div>

      <div style={{ padding: "12px 20px 12px" }}>
        <PrimaryButton label="→ Proceed to Verify" disabled={progress < 100} onClick={onNext} />
      </div>
    </div>
  );
}

function AutofillField({ label, value, filled }: { label: string; value: string; filled: boolean }) {
  const [displayVal, setDisplayVal] = useState("");
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!filled) return;
    setFlash(true);
    let i = 0;
    const t = setInterval(() => {
      setDisplayVal(value.slice(0, i + 1));
      i++;
      if (i >= value.length) { clearInterval(t); setTimeout(() => setFlash(false), 400); }
    }, 60);
    return () => clearInterval(t);
  }, [filled]);

  return (
    <div style={{ background: C.white, borderRadius: 10, overflow: "hidden", border: `1.5px solid ${flash ? C.teal500 : C.divider}`, transition: "border-color 0.3s" }}>
      <div style={{ padding: "4px 12px", background: C.bgCanvas, borderBottom: `1px solid ${C.divider}` }}>
        <p style={{ margin: 0, fontSize: 10, color: C.textSecondary, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</p>
      </div>
      <div style={{ padding: "8px 12px", minHeight: 34, display: "flex", alignItems: "center" }}>
        <p style={{ margin: 0, fontSize: 13, color: filled ? C.textPrimary : C.textSecondary, fontStyle: filled ? "normal" : "italic" }}>
          {filled ? displayVal : "Waiting..."}
          {filled && displayVal.length < value.length && <span style={{ opacity: 0.5, animation: "blink 0.7s infinite" }}>|</span>}
        </p>
      </div>
    </div>
  );
}

// ─── Final Verification ───────────────────────────────────────────────────────

function FinalVerificationScreen({ onNext }: { onNext: () => void }) {
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [captchaInput, setCaptchaInput] = useState("");
  const [showDemo, setShowDemo] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setShowDemo(true), 1500);
    return () => clearTimeout(t);
  }, []);

  const handleAutoFill = () => {
    setShowDemo(false);
    setAutoFilling(true);
    DEMO_OTP.split("").forEach((d, i) => {
      setTimeout(() => {
        setDigits(prev => { const n = [...prev]; n[i] = d; return n; });
        if (i < 5) inputRefs.current[i + 1]?.focus();
      }, i * 160);
    });
    setTimeout(() => {
      setCaptchaInput(DEMO_CAPTCHA);
      setAutoFilling(false);
    }, 6 * 160 + 400);
  };

  const handleDigit = (i: number, val: string) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...digits];
    next[i] = val;
    setDigits(next);
    if (val && i < 5) inputRefs.current[i + 1]?.focus();
  };

  const ready = digits.every(d => d) && captchaInput === DEMO_CAPTCHA;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: C.bgCanvas, position: "relative" }}>
      {/* Dark header panel */}
      <div style={{ background: C.teal900, padding: "20px 20px 28px" }}>
        <p style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: C.white, fontFamily: "'Poppins',sans-serif" }}>Final Verification</p>
        <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Enter the OTP sent by NCRP to verify your Identity</p>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px" }}>
        {/* OTP */}
        <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 600, color: C.textPrimary }}>NCRP One-Time Password</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 28 }}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={el => { inputRefs.current[i] = el; }}
              value={d}
              onChange={e => handleDigit(i, e.target.value)}
              maxLength={1}
              style={{
                width: 46, height: 54, borderRadius: 12,
                border: `2px solid ${d ? C.teal600 : C.divider}`,
                background: C.white, fontSize: 22, fontWeight: 700,
                textAlign: "center", color: C.textPrimary, outline: "none",
                fontFeatureSettings: "'tnum'",
                transition: "border-color 0.15s, transform 0.12s",
                transform: autoFilling && d ? "scale(1.08)" : "scale(1)",
              }}
            />
          ))}
        </div>

        {/* Captcha */}
        <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: C.textPrimary }}>Security Code</p>
        <div style={{ background: C.white, borderRadius: 14, padding: "14px 16px", marginBottom: 12, border: `1px solid ${C.divider}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{
            fontFamily: "monospace", fontSize: 24, fontWeight: 700,
            color: C.teal700, letterSpacing: "0.25em",
            background: `repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(20,107,102,0.05) 2px, rgba(20,107,102,0.05) 4px)`,
            padding: "4px 12px", borderRadius: 8,
            textDecoration: "line-through", textDecorationColor: `${C.teal500}50`,
            filter: "url(#distort)",
          }}>
            {DEMO_CAPTCHA}
          </div>
          <button style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>🔄</button>
        </div>
        <input
          value={captchaInput}
          onChange={e => setCaptchaInput(e.target.value.toUpperCase())}
          placeholder="Type the security code above"
          style={{
            width: "100%", padding: "12px 14px", borderRadius: 12,
            border: `1.5px solid ${captchaInput === DEMO_CAPTCHA ? C.success : captchaInput.length > 0 ? C.divider : C.divider}`,
            background: C.white, fontSize: 14, color: C.textPrimary,
            outline: "none", boxSizing: "border-box",
          }}
        />
      </div>

      <div style={{ padding: "12px 20px 12px" }}>
        <PrimaryButton label="🛡 Submit Complaint" disabled={!ready} onClick={onNext} style={{ background: ready ? C.teal900 : undefined }} />
      </div>

      {/* Demo popup */}
      {showDemo && (
        <DemoPopup
          title="🏛️ NCRP Verification Codes"
          message="Portal OTP + security code received"
          code={`OTP: ${DEMO_OTP}  |  Code: ${DEMO_CAPTCHA}`}
          hint="Tap to auto-fill both"
          onFill={handleAutoFill}
          onDismiss={() => setShowDemo(false)}
        />
      )}
    </div>
  );
}

// ─── Success ──────────────────────────────────────────────────────────────────

function SuccessScreen({ onTrack, onHome }: { onTrack: () => void; onHome: () => void }) {
  const [drawn, setDrawn] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setTimeout(() => setDrawn(true), 200);
  }, []);

  const copy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "32px 20px 20px", display: "flex", flexDirection: "column", alignItems: "center", background: C.bgCanvas }}>
      {/* Success icon */}
      <div style={{ marginBottom: 24, position: "relative" }}>
        <svg width="80" height="80" viewBox="0 0 80 80">
          <circle
            cx="40" cy="40" r="36"
            fill={C.success}
            strokeDasharray="226"
            strokeDashoffset={drawn ? 0 : 226}
            style={{ transition: "stroke-dashoffset 0.6s ease-out" }}
          />
          <path
            d="M24 40 L35 51 L56 29"
            fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray="50"
            strokeDashoffset={drawn ? 0 : 50}
            style={{ transition: "stroke-dashoffset 0.5s ease-out 0.5s" }}
          />
        </svg>
        {drawn && (
          <div style={{
            position: "absolute", inset: -20, borderRadius: "50%",
            background: `radial-gradient(circle, ${C.success}20, transparent)`,
            animation: "glow 1.5s ease-out forwards",
          }} />
        )}
      </div>

      <h1 style={{ fontFamily: "'Poppins',sans-serif", fontSize: 22, fontWeight: 700, color: C.textPrimary, margin: "0 0 8px", textAlign: "center" }}>
        Complaint Filed Successfully!
      </h1>
      <p style={{ fontSize: 13, color: C.textSecondary, textAlign: "center", margin: "0 0 28px", lineHeight: 1.6 }}>
        Your report has been officially registered with the National Cyber Crime Portal.
      </p>

      {/* Tracking number */}
      <div style={{
        width: "100%", border: `2px dashed ${C.teal600}40`,
        borderRadius: 16, padding: "16px 20px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        background: C.white, marginBottom: 24,
        boxSizing: "border-box",
      }}>
        <div>
          <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 700, color: C.textSecondary, letterSpacing: "0.1em", textTransform: "uppercase" }}>NCRP TRACKING NUMBER</p>
          <p style={{ margin: 0, fontFamily: "monospace", fontSize: 18, fontWeight: 700, color: C.teal700, fontFeatureSettings: "'tnum'" }}>{DEMO_TRACKING}</p>
        </div>
        <button onClick={copy} style={{
          background: copied ? C.successBg : C.mint100,
          border: "none", borderRadius: 10,
          padding: "8px 12px", cursor: "pointer",
          fontSize: 12, fontWeight: 600,
          color: copied ? C.success : C.teal600,
          transition: "all 0.2s",
        }}>
          {copied ? "✓ Copied!" : "📋 Copy"}
        </button>
      </div>

      {/* What's next */}
      <div style={{ width: "100%", background: C.white, borderRadius: 16, padding: "16px 20px", marginBottom: 24, boxSizing: "border-box" }}>
        <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, color: C.textPrimary }}>What happens next?</p>
        {[
          "NCRP will review the incident within 24–48 hours.",
          "Sathi will alert your linked bank to flag the fraud transaction.",
          "You will receive SMS updates at each stage.",
        ].map((s, i) => (
          <div key={i} style={{ display: "flex", gap: 10, marginBottom: i < 2 ? 10 : 0 }}>
            <span style={{ width: 20, height: 20, background: C.mint100, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: C.teal600, flexShrink: 0 }}>{i + 1}</span>
            <p style={{ margin: 0, fontSize: 13, color: C.textSecondary, lineHeight: 1.5 }}>{s}</p>
          </div>
        ))}
      </div>

      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10, boxSizing: "border-box" }}>
        <PrimaryButton label="🔍 Track Status" onClick={onTrack} />
        <SecondaryButton label="Back to Home" onClick={onHome} />
      </div>

      <style>{`@keyframes glow { from{opacity:1} to{opacity:0} }`}</style>
    </div>
  );
}

// ─── My Cases ─────────────────────────────────────────────────────────────────

function MyCasesScreen({ onCase }: { onCase: () => void }) {
  const cases = [
    { icon: "💳", title: "UPI Payment Fraud", meta: "Lost: ₹15,000 • Aug 30, 2026", status: "In Progress", statusColor: "#FDECC8", statusText: "#9A6100" },
    { icon: "📱", title: "Electricity Bill SMS Fraud", meta: "Lost: ₹5,000 • Jan 24, 2026", status: "Under Review", statusColor: "#DCEBFB", statusText: "#1A56B0" },
    { icon: "🌐", title: "Phishing Website - Amazon", meta: "No loss • Dec 10, 2025", status: "Resolved", statusColor: C.successBg, statusText: C.success },
  ];

  return (
    <div style={{ flex: 1, overflowY: "auto", background: C.bgCanvas, padding: "16px 20px" }}>
      <h1 style={{ fontFamily: "'Poppins',sans-serif", fontSize: 22, fontWeight: 700, color: C.textPrimary, margin: "0 0 20px" }}>My Cases</h1>
      {cases.map((c, i) => (
        <div key={i} onClick={onCase} style={{
          background: C.white, borderRadius: 16,
          padding: "16px", marginBottom: 12,
          cursor: "pointer",
          boxShadow: `0 4px 12px rgba(11,46,46,0.07)`,
          display: "flex", gap: 14, alignItems: "center",
        }}>
          <div style={{ width: 44, height: 44, background: C.bgCanvas, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{c.icon}</div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 600, color: C.textPrimary }}>{c.title}</p>
            <p style={{ margin: 0, fontSize: 11, color: C.textSecondary }}>{c.meta}</p>
          </div>
          <span style={{ background: c.statusColor, color: c.statusText, fontSize: 10, fontWeight: 700, padding: "4px 8px", borderRadius: 10, whiteSpace: "nowrap" }}>{c.status}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Case Status ──────────────────────────────────────────────────────────────

function CaseStatusScreen({ onBack }: { onBack: () => void }) {
  const steps = [
    { label: "Case Filed Successfully", desc: "Complaint registered with NCRP", date: "Aug 30, 2026 • 3:15 PM", state: "done" },
    { label: "Under Investigation", desc: "Cyber Cell has identified the recipient wallet address.", date: "Aug 31, 2026 • 11:30 AM", state: "active" },
    { label: "Resolved & Refunded", desc: "Pending resolution", date: "", state: "pending" },
  ];

  return (
    <ScreenShell title="Case Status" subtitle="" onBack={onBack}>
      {/* Case summary */}
      <div style={{ background: C.white, borderRadius: 16, padding: "16px", marginBottom: 20, boxShadow: `0 4px 12px rgba(11,46,46,0.08)` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <p style={{ margin: 0, fontSize: 11, color: C.textSecondary }}>CASE ID: CS-2026-98</p>
          <span style={{ background: "#FDECC8", color: "#9A6100", fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 8 }}>In Progress</span>
        </div>
        <p style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: C.textPrimary }}>UPI Payment Fraud</p>
        <p style={{ margin: 0, fontSize: 12, color: C.textSecondary }}>Reported Aug 30, 2026 • Lost: ₹15,000</p>
      </div>

      {/* Stepper */}
      <p style={{ margin: "0 0 16px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.textSecondary }}>Investigation Progress</p>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {steps.map((s, i) => (
          <div key={i} style={{ display: "flex", gap: 14 }}>
            {/* Left indicator */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                background: s.state === "done" ? C.success : s.state === "active" ? C.teal600 : "transparent",
                border: `2px ${s.state === "pending" ? "dashed" : "solid"} ${s.state === "done" ? C.success : s.state === "active" ? C.teal600 : C.divider}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, color: C.white,
                position: "relative",
              }}>
                {s.state === "done" ? "✓" : s.state === "active" ? (
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: C.white, animation: "blink 1.5s infinite" }} />
                ) : ""}
              </div>
              {i < steps.length - 1 && (
                <div style={{ width: 2, flex: 1, background: s.state === "done" ? C.success : C.divider, margin: "4px 0", minHeight: 32, borderRadius: 1, borderStyle: i === steps.length - 2 ? "dashed" : "solid", borderColor: "transparent", backgroundImage: s.state !== "done" ? `repeating-linear-gradient(to bottom, ${C.divider} 0, ${C.divider} 6px, transparent 6px, transparent 10px)` : "none" }} />
              )}
            </div>
            {/* Content */}
            <div style={{ paddingBottom: 24 }}>
              <p style={{ margin: "2px 0 4px", fontSize: 14, fontWeight: s.state === "active" ? 700 : 500, color: s.state === "pending" ? C.textSecondary : C.textPrimary }}>{s.label}</p>
              <p style={{ margin: "0 0 2px", fontSize: 12, color: C.textSecondary, lineHeight: 1.5 }}>{s.desc}</p>
              {s.date && <p style={{ margin: 0, fontSize: 11, color: C.textSecondary }}>{s.date}</p>}
            </div>
          </div>
        ))}
      </div>
    </ScreenShell>
  );
}

// ─── Defend (Community) ───────────────────────────────────────────────────────

function DefendScreen() {
  const posts = [
    { cat: "Electricity SMS Fraud", date: "Aug 29, 2026", loc: "Western Mumbai, MH", count: 412, excerpt: "Received SMS threatening power disconnection unless ₹3,000 paid within 2 hours via a fake link...", votes: 142 },
    { cat: "Fake Job Offer – Telegram", date: "Aug 28, 2026", loc: "Bangalore, KA", count: 89, excerpt: "WhatsApp message offering ₹800/task data entry job. They ask for ₹500 \"registration fee\" upfront.", votes: 67 },
    { cat: "UPI QR Code Scam", date: "Aug 27, 2026", loc: "Pune, MH", count: 203, excerpt: "Sent a QR code asking me to \"scan to receive\" ₹50,000 lottery prize. It actually charged my account.", votes: 98 },
  ];

  return (
    <div style={{ flex: 1, overflowY: "auto", background: C.bgCanvas, padding: "16px 20px" }}>
      <h1 style={{ fontFamily: "'Poppins',sans-serif", fontSize: 22, fontWeight: 700, color: C.textPrimary, margin: "0 0 4px" }}>Defend</h1>
      <p style={{ margin: "0 0 20px", fontSize: 13, color: C.textSecondary }}>Community scam alerts from verified users</p>

      {posts.map((p, i) => (
        <div key={i} style={{ background: C.white, borderRadius: 16, padding: "16px", marginBottom: 12, boxShadow: `0 4px 12px rgba(11,46,46,0.07)` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ background: C.warning, color: "#7a4d00", fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 8 }}>{p.cat}</span>
            <span style={{ fontSize: 11, color: C.textSecondary }}>{p.date}</span>
          </div>
          <p style={{ margin: "0 0 6px", fontSize: 13, color: C.textPrimary, lineHeight: 1.5 }}>"{p.excerpt}"</p>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <span style={{ fontSize: 11 }}>📍</span>
            <span style={{ fontSize: 11, color: C.textSecondary }}>{p.loc}</span>
            <span style={{ fontSize: 11, color: C.danger, marginLeft: "auto", fontWeight: 600 }}>⚠ Also reported by {p.count} others</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ flex: 1, padding: "8px", borderRadius: 20, background: C.bgCanvas, border: `1px solid ${C.divider}`, fontSize: 12, fontWeight: 600, color: C.textPrimary, cursor: "pointer" }}>
              🚩 I got this too ({p.votes})
            </button>
            <button style={{ padding: "8px 14px", borderRadius: 20, background: C.bgCanvas, border: `1px solid ${C.divider}`, fontSize: 12, color: C.textSecondary, cursor: "pointer" }}>
              Sounds Fake
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Profile ──────────────────────────────────────────────────────────────────

function ProfileScreen({ language, setLanguage }: { language: string; setLanguage: (l: "en" | "hi") => void }) {
  return (
    <div style={{ flex: 1, overflowY: "auto", background: C.bgCanvas, padding: "20px 20px" }}>
      {/* Avatar */}
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ width: 72, height: 72, borderRadius: "50%", background: `linear-gradient(135deg, ${C.teal600}, ${C.teal500})`, margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, color: C.white, fontWeight: 700 }}>AK</div>
        <p style={{ margin: "0 0 2px", fontSize: 17, fontWeight: 700, color: C.textPrimary }}>Arjun Kumar</p>
        <p style={{ margin: 0, fontSize: 13, color: C.textSecondary }}>+91 98765 43210</p>
      </div>

      {/* Editable fields */}
      <div style={{ background: C.white, borderRadius: 16, overflow: "hidden", marginBottom: 16, boxShadow: `0 4px 12px rgba(11,46,46,0.07)` }}>
        {[
          { label: "State / District", value: "Maharashtra, Mumbai" },
          { label: "App Language", value: language === "hi" ? "हिंदी" : "English (Default)", isLang: true },
        ].map((r, i) => (
          <div key={i} style={{ padding: "14px 16px", borderBottom: i === 0 ? `1px solid ${C.divider}` : "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p style={{ margin: "0 0 1px", fontSize: 11, color: C.textSecondary }}>{r.label}</p>
              <p style={{ margin: 0, fontSize: 14, color: C.textPrimary }}>{r.value}</p>
            </div>
            {r.isLang ? (
              <select
                value={language}
                onChange={e => setLanguage(e.target.value as "en" | "hi")}
                style={{ border: `1px solid ${C.divider}`, borderRadius: 8, padding: "4px 8px", fontSize: 12, color: C.teal600, background: C.mint100, outline: "none" }}
              >
                <option value="en">English</option>
                <option value="hi">हिंदी</option>
              </select>
            ) : (
              <span style={{ color: C.teal600, fontSize: 14 }}>✏️</span>
            )}
          </div>
        ))}
      </div>

      {/* Nav rows */}
      {[
        { icon: "⚙️", label: "Manage Permissions" },
        { icon: "🔒", label: "Data & Privacy" },
      ].map((r, i) => (
        <div key={i} style={{
          background: C.white, borderRadius: 14, padding: "14px 16px",
          display: "flex", gap: 12, alignItems: "center",
          marginBottom: 10, cursor: "pointer",
          boxShadow: `0 2px 8px rgba(11,46,46,0.06)`,
        }}>
          <span style={{ fontSize: 18 }}>{r.icon}</span>
          <span style={{ flex: 1, fontSize: 14, color: C.textPrimary }}>{r.label}</span>
          <span style={{ color: C.textSecondary }}>›</span>
        </div>
      ))}

      <button style={{
        width: "100%", marginTop: 12, padding: "14px",
        borderRadius: 28, border: `2px solid ${C.danger}`,
        background: "transparent", color: C.danger,
        fontSize: 15, fontWeight: 700, cursor: "pointer",
      }}>
        Log Out Account
      </button>
    </div>
  );
}

// ─── Tab Bar ──────────────────────────────────────────────────────────────────

function TabBar({ active, onSwitch }: { active: Tab; onSwitch: (t: Tab) => void }) {
  const tabs: { key: Tab; icon: string; label: string }[] = [
    { key: "home", icon: "🎙️", label: "Assistant" },
    { key: "my-cases", icon: "📋", label: "My Cases" },
    { key: "defend", icon: "🛡️", label: "Defend" },
    { key: "profile", icon: "👤", label: "Profile" },
  ];

  return (
    <div style={{
      background: C.white,
      borderTop: `1px solid ${C.divider}`,
      display: "flex",
      height: 64,
    }}>
      {tabs.map(t => (
        <button
          key={t.key}
          onClick={() => onSwitch(t.key)}
          style={{
            flex: 1, border: "none", background: "transparent",
            cursor: "pointer", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 2,
            position: "relative",
          }}
        >
          {active === t.key && (
            <div style={{
              position: "absolute", top: 8, borderRadius: 14,
              background: C.mint100,
              width: 48, height: 30,
            }} />
          )}
          <span style={{ fontSize: 18, position: "relative", zIndex: 1 }}>{t.icon}</span>
          <span style={{
            fontSize: 10, fontWeight: active === t.key ? 700 : 400,
            color: active === t.key ? C.teal600 : C.textSecondary,
            position: "relative", zIndex: 1,
          }}>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Reusable primitives ──────────────────────────────────────────────────────

function OnboardShell({ step, title, subtitle, children }: { step: number; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div style={{
      flex: 1, background: C.teal900, display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ background: C.teal900, padding: "16px 20px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>Step {step} of 4</span>
          {/* Progress bar */}
          <div style={{ width: 80, height: 4, background: "rgba(255,255,255,0.15)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(step / 4) * 100}%`, background: C.mint300, borderRadius: 2, transition: "width 0.5s ease" }} />
          </div>
        </div>
        <h1 style={{ fontFamily: "'Poppins',sans-serif", color: C.white, fontSize: 24, fontWeight: 700, margin: "0 0 4px" }}>{title}</h1>
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, margin: 0 }}>{subtitle}</p>
      </div>

      {/* White card body */}
      <div style={{
        flex: 1, background: C.white, borderRadius: "28px 28px 0 0",
        padding: "24px 20px", overflowY: "auto",
        display: "flex", flexDirection: "column",
      }}>
        {children}
      </div>
    </div>
  );
}

function ScreenShell({ title, subtitle, onBack, children }: { title: string; subtitle: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: C.bgCanvas }}>
      <div style={{ padding: "16px 20px 14px", background: C.white, borderBottom: `1px solid ${C.divider}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, padding: "4px 0", color: C.teal600 }}>‹</button>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.textPrimary, fontFamily: "'Poppins',sans-serif" }}>{title}</h2>
            {subtitle && <p style={{ margin: 0, fontSize: 12, color: C.textSecondary }}>{subtitle}</p>}
          </div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px", display: "flex", flexDirection: "column" }}>
        {children}
      </div>
    </div>
  );
}

function PrimaryButton({ label, onClick, disabled = false, style = {} }: { label: string; onClick: () => void; disabled?: boolean; style?: React.CSSProperties }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      style={{
        width: "100%", padding: "15px 20px",
        borderRadius: 28, border: "none",
        background: disabled ? "#ccc" : C.teal600,
        color: disabled ? "#888" : C.white,
        fontSize: 15, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
        transition: "transform 0.1s, background 0.2s",
        ...style,
      }}
      onMouseDown={e => { if (!disabled) e.currentTarget.style.transform = "scale(0.97)"; }}
      onMouseUp={e => { e.currentTarget.style.transform = "scale(1)"; }}
    >
      {label}
    </button>
  );
}

function SecondaryButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", padding: "14px 20px",
        borderRadius: 28, border: `2px solid ${C.teal600}`,
        background: "transparent", color: C.teal600,
        fontSize: 15, fontWeight: 700, cursor: "pointer",
        transition: "transform 0.1s",
      }}
      onMouseDown={e => (e.currentTarget.style.transform = "scale(0.97)")}
      onMouseUp={e => (e.currentTarget.style.transform = "scale(1)")}
    >
      {label}
    </button>
  );
}

function GhostButton({ label, onClick, style = {} }: { label: string; onClick: () => void; style?: React.CSSProperties }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none", border: "none",
        color: C.textSecondary, fontSize: 14,
        cursor: "pointer", padding: "10px 16px",
        textDecoration: "underline",
        ...style,
      }}
    >
      {label}
    </button>
  );
}

function InfoBanner({ text }: { text: string }) {
  return (
    <div style={{ background: C.mint100, borderRadius: 14, padding: "12px 14px" }}>
      <p style={{ margin: 0, fontSize: 12, color: C.teal700, lineHeight: 1.5 }}>{text}</p>
    </div>
  );
}

function SelectableCard({ selected, onSelect, label, sub }: { selected: boolean; onSelect: () => void; label: string; sub: string }) {
  return (
    <div
      onClick={onSelect}
      style={{
        background: selected ? C.mint100 : C.white,
        border: `2px solid ${selected ? C.teal600 : C.divider}`,
        borderRadius: 16,
        padding: "14px 16px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        cursor: "pointer",
        transition: "border-color 0.2s, background 0.2s",
      } as React.CSSProperties}
    >
      <div>
        <p style={{ margin: "0 0 2px", fontSize: 15, fontWeight: 600, color: C.textPrimary }}>{label}</p>
        <p style={{ margin: 0, fontSize: 12, color: C.textSecondary }}>{sub}</p>
      </div>
      <div style={{
        width: 24, height: 24, borderRadius: "50%",
        border: `2px solid ${selected ? C.teal600 : "#ccc"}`,
        background: selected ? C.teal600 : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, color: C.white, flexShrink: 0,
        transition: "all 0.2s",
      }}>
        {selected ? "✓" : ""}
      </div>
    </div>
  );
}

function ToggleRow({ icon, title, desc, on, onToggle }: { icon: string; title: string; desc: string; on: boolean; onToggle: () => void }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "14px 16px", background: C.white, borderRadius: 14, boxShadow: `0 2px 8px rgba(11,46,46,0.06)` }}>
      <div style={{ width: 40, height: 40, borderRadius: "50%", background: C.mint100, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600, color: C.textPrimary }}>{title}</p>
        <p style={{ margin: 0, fontSize: 11, color: C.textSecondary, lineHeight: 1.4 }}>{desc}</p>
      </div>
      {/* Toggle switch */}
      <div onClick={onToggle} style={{
        width: 48, height: 28, borderRadius: 14, background: on ? C.teal600 : "#ccc",
        position: "relative", cursor: "pointer", flexShrink: 0,
        transition: "background 0.2s",
      }}>
        <div style={{
          width: 22, height: 22, borderRadius: "50%", background: C.white,
          position: "absolute", top: 3, left: on ? 23 : 3,
          transition: "left 0.2s ease",
          boxShadow: "0 2px 4px rgba(0,0,0,0.15)",
        }} />
      </div>
    </div>
  );
}

// ─── Demo Popup ───────────────────────────────────────────────────────────────

function DemoPopup({ title, message, code, hint, onFill, onDismiss }: {
  title: string; message: string; code: string; hint: string;
  onFill: () => void; onDismiss: () => void;
}) {
  return (
    <div style={{
      position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)",
      display: "flex", alignItems: "flex-end",
      animation: "fadeIn 0.3s ease",
      zIndex: 100,
    }}>
      {/* Slide-up card */}
      <div style={{
        background: C.white,
        borderRadius: "24px 24px 0 0",
        width: "100%",
        padding: "20px 20px 28px",
        animation: "slideUp 0.35s cubic-bezier(0.34,1.56,0.64,1)",
      }}>
        <div style={{ width: 40, height: 4, background: "#ddd", borderRadius: 2, margin: "0 auto 16px" }} />

        {/* Demo badge */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#EFF6FF", borderRadius: 8, padding: "4px 10px", marginBottom: 12 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#3B82F6", animation: "blink 1s infinite" }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: "#1D4ED8", letterSpacing: "0.06em" }}>PROTOTYPE DEMO MODE</span>
        </div>

        <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 700, color: C.textPrimary }}>{title}</h3>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: C.textSecondary }}>{message}</p>

        {/* Code display */}
        <div style={{
          background: C.teal900,
          borderRadius: 14,
          padding: "16px 20px",
          textAlign: "center",
          marginBottom: 16,
        }}>
          <p style={{ margin: "0 0 4px", fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Demo Code</p>
          <p style={{
            margin: 0, fontFamily: "monospace",
            fontSize: 28, fontWeight: 700,
            color: C.mint300, letterSpacing: "0.2em",
            fontFeatureSettings: "'tnum'",
          }}>{code}</p>
        </div>

        <p style={{ textAlign: "center", fontSize: 12, color: C.textSecondary, margin: "0 0 16px" }}>{hint}</p>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onDismiss} style={{ flex: 1, padding: "12px", borderRadius: 22, border: `1.5px solid ${C.divider}`, background: "transparent", color: C.textSecondary, fontSize: 14, cursor: "pointer" }}>
            Dismiss
          </button>
          <button onClick={onFill} style={{ flex: 2, padding: "12px", borderRadius: 22, border: "none", background: C.teal600, color: C.white, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            ✨ Auto-Fill
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
      `}</style>
    </div>
  );
}
