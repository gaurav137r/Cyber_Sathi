import React from "react";
import { useConversation } from "../context/ConversationContext";
import { IdleState } from "./IdleState";
import { VoicePanel } from "./VoicePanel";
import { ChatPanel } from "./ChatPanel";
import { CaseReviewPanel } from "./CaseReviewPanel";

interface ConversationViewProps {
  userCases: any[];
  loadCases: (userId: string) => Promise<void>;
  activeTab: "home" | "my-cases" | "defend" | "profile";
  switchTab: (tab: "home" | "my-cases" | "defend" | "profile") => void;
}

export function ConversationView({
  userCases,
  loadCases,
  activeTab,
  switchTab,
}: ConversationViewProps) {
  const {
    screen,
    caseId,
    language,
    messages,
    isTyping,
    voiceSession,
    liveSession,
    voiceError,
    startVoice,
    endVoice,
    switchToChat,
    startChat,
    goBack,
    selectCase,
  } = useConversation();

  return (
    <div
      style={{
        flex: 1,
        overflow: "hidden",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        background: "#F4F5F3",
      }}
    >
      {/* Top Status Bar */}
      <div
        style={{
          height: 44,
          background: screen === "voice" ? "#0B2E2E" : "#F4F5F3",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          flexShrink: 0,
          transition: "background 0.2s",
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: screen === "voice" ? "rgba(255,255,255,0.8)" : "#5B6B68",
          }}
        >
          9:41
        </span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 11 }}>📶</span>
          <span style={{ fontSize: 11 }}>🔋</span>
        </div>
      </div>

      {/* Screen Content */}
      <div
        style={{
          flex: 1,
          overflow: "hidden",
          position: "relative",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {screen === "idle" && (
          <IdleState
            caseId={caseId}
            language={language}
            messages={messages}
            userCases={userCases}
            loadCases={loadCases}
            startVoice={startVoice}
            startChat={startChat}
            selectCase={selectCase}
          />
        )}

        {screen === "voice" && (
          <VoicePanel />
        )}

        {screen === "chat" && (
          <ChatPanel
            caseId={caseId}
            language={language}
            messages={messages}
            isTyping={isTyping}
            voiceSession={voiceSession}
            liveSession={liveSession}
            voiceError={voiceError}
            startVoice={() => {
              if (caseId) void startVoice(caseId, language)
            }}
            goBack={goBack}
            selectCase={selectCase}
          />
        )}

        {screen === "review" && (
          <CaseReviewPanel
            caseId={caseId}
            language={language}
            messages={messages}
            startVoice={() => {
              if (caseId) void startVoice(caseId, language)
            }}
            goBack={goBack}
            selectCase={selectCase}
          />
        )}
      </div>

      {/* Bottom Tab Bar */}
      {screen !== "voice" && (
        <div
          style={{
            height: 56,
            background: "#FFFFFF",
            borderTop: "1px solid #E6E8E6",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-around",
            padding: "0 12px",
            flexShrink: 0,
          }}
        >
          <button
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: activeTab === "home" ? "#146B66" : "#888",
              textDecoration: "none",
            }}
            onClick={() => switchTab("home")}
          >
            🏠 Home
          </button>
          <button
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: activeTab === "my-cases" ? "#146B66" : "#888",
              textDecoration: "none",
            }}
            onClick={() => switchTab("my-cases")}
          >
            📋 Cases
          </button>
          <button
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "#888",
              textDecoration: "none",
            }}
            onClick={() => {}}
          >
            🛡️ Defend
          </button>
          <button
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "#888",
              textDecoration: "none",
            }}
            onClick={() => switchTab("profile")}
          >
            👤 Profile
          </button>
        </div>
      )}
    </div>
  );
}
