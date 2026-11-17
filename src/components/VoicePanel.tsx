import React from "react";
import { useConversation } from "../context/ConversationContext";
import { useVoiceSession } from "../hooks/useVoiceSession";

interface VoicePanelProps {
  className?: string;
}

export function VoicePanel({ className }: VoicePanelProps) {
  const {
    voiceSession,
    liveSession,
    voiceError,
    messages,
    setTyping,
    addMessage,
    appendMessage,
  } = useConversation();
  const {
    startVoice,
    endVoice,
    switchToChat,
    isStarting,
    isStarted,
    micReady,
    error,
  } = useVoiceSession();

  // Find the agent's latest message for live transcript display
  const agentMessages = messages.filter((m) => m.role === "agent");
  const latestAgentMessage = agentMessages[agentMessages.length - 1];

  return (
    <div
      className={className}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        background: "#0B2E2E",
        color: "#FFFFFF",
        padding: "20px",
      }}
    >
      {/* Top Status Bar */}
      <div
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0 16px",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: "#7FD1C0",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            {voiceSession ? "VOICE SESSION" : "DISCONNECTED"}
          </span>
          {voiceSession && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: "#7FD1C0",
                background: "#0F4C4C",
                padding: "2px 8px",
                borderRadius: 4,
              }}
            >
              {isStarting ? "..." : isStarted ? "●" : "○"}
            </span>
          )}
        </div>
        <div style={{ textAlign: "right", fontSize: 11, color: "#7FD1C0" }}>
          {voiceSession ? "00:{time}" : "—"}
        </div>
      </div>

      {/* Timer (Top Right) */}
      <div
        style={{
          position: "absolute",
          top: 60,
          right: 20,
          fontSize: 14,
          fontWeight: 700,
          color: "#7FD1C0",
          background: "rgba(11, 46, 46, 0.6)",
          padding: "6px 14px",
          borderRadius: 20,
          minWidth: 60,
        }}
      >
        00:00
      </div>

      {/* Main Content Area - Waveform Visualization */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          padding: "20px",
          position: "relative",
        }}
      >
        {/* Waveform Visualization */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          {/* Agent Messages (Above) */}
          <div
            style={{
              maxWidth: "85%",
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginBottom: 8,
            }}
          >
            {latestAgentMessage && (
              <div
                style={{
                  padding: "12px 16px",
                  background: "rgba(127, 209, 192, 0.15)",
                  borderRadius: 12,
                  borderLeft: "3px solid #7FD1C0",
                  color: "#FFFFFF",
                  fontSize: 14,
                  lineHeight: 1.5,
                  wordWrap: "break-word",
                }}
              >
                {latestAgentMessage.text}
              </div>
            )}
          </div>

          {/* Waveform Rings */}
          <div
            style={{
              display: "flex",
              gap: 8,
              padding: "20px",
              background: "rgba(255, 255, 255, 0.05)",
              borderRadius: 24,
            }}
          >
            {[1, 0.75, 0.5].map((scale, index) => (
              <div
                key={index}
                style={{
                  position: "relative",
                  width: "100%",
                  height: "100%",
                  borderRadius: "50%",
                  background: `rgba(127, 209, 192, ${(0.12 + 0.12 - index * 0.025).toFixed(3)})`,
                  border: "1px solid rgba(127, 209, 192, 0.08)",
                  animation: voiceSession && isStarted
                    ? `voiceListeningPulse 1.4s ease-in-out ${index * 160}ms infinite`
                    : "none",
                }}
              />
            ))}
          </div>

          {/* Mic Center */}
          <div
            style={{
              width: 112,
              height: 112,
              borderRadius: "50%",
              background: voiceSession && isStarted ? "#7FD1C0" : "#FFFFFF",
              color: "#0B2E2E",
              display: "grid",
              placeItems: "center",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
              fontSize: 42,
              marginTop: 8,
            }}
          >
            🎙
          </div>
        </div>

        {/* Live Transcript Area */}
        <div
          style={{
            width: "100%",
            maxWidth: "85%",
            marginTop: 20,
            padding: "16px",
            background: "rgba(255, 255, 255, 0.05)",
            borderRadius: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: "#7FD1C0",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              {voiceSession ? "LIVE TRANSCRIPT" : "NO ACTIVE SESSION"}
            </span>
            {voiceError && (
              <span style={{ fontSize: 10, color: "#FF6B6B", fontWeight: 700 }}>⚠️ {voiceError}</span>
            )}
          </div>
          <div
            style={{
              minHeight: 80,
              fontSize: 14,
              lineHeight: 1.6,
              color: "#FFFFFF",
              wordWrap: "break-word",
              whiteSpace: "pre-wrap",
            }}
          >
            {latestAgentMessage
              ? latestAgentMessage.text
              : voiceSession
              ? isStarting
              ? "Connecting to Saathi..."
              : isStarted
              ? "Listening. Speak now."
              : "Tap the microphone to start the conversation."
              : "No active session."}
          </div>
        </div>
      </div>

      {/* Bottom Buttons */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "16px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "#0B2E2E",
        }}
      >
        {/* Switch to Chat (Bottom Left) */}
        <button
          onClick={switchToChat}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "12px 20px",
            border: "none",
            borderRadius: 24,
            background: "rgba(255, 255, 255, 0.1)",
            color: "#FFFFFF",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <span>💬</span>
          <span>Switch to Chat</span>
        </button>

        {/* End Call (Bottom Center) */}
        <button
          onClick={endVoice}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "16px 36px",
            border: "none",
            borderRadius: 28,
            background: "#FF6B6B",
            color: "#FFFFFF",
            fontSize: 18,
            fontWeight: 800,
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(255, 107, 107, 0.4)",
          }}
        >
          <span>📞</span>
          <span>End Call</span>
        </button>

        {/* Start Voice (Bottom Right) */}
        <button
          onClick={startVoice}
          disabled={isStarting || isStarted}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "16px 36px",
            border: "none",
            borderRadius: 28,
            background: isStarting || isStarted ? "#555" : "#7FD1C0",
            color: "#0B2E2E",
            fontSize: 18,
            fontWeight: 800,
            cursor: isStarting || isStarted ? "not-allowed" : "pointer",
            boxShadow: "0 4px 12px rgba(127, 209, 192, 0.3)",
          }}
        >
          <span>🎙️</span>
          <span>{isStarting ? "Starting..." : isStarted ? "Active" : "Start Voice"}</span>
        </button>
      </div>

      {/* Animation Styles */}
      <style>{`
        @keyframes voiceListeningPulse {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
}
