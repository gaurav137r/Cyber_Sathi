import React from "react";
import { useConversation } from "../context/ConversationContext";

interface IdleStateProps {
  caseId: string | null;
  language: "en" | "hi" | "bn";
  messages: any[];
  userCases: any[];
  loadCases: (userId: string) => Promise<void>;
  startVoice: (caseId: string, language: string) => Promise<void>;
  startChat: (caseId: string, language: string) => Promise<void>;
  selectCase: (caseId: string) => void;
}

export function IdleState({
  caseId,
  language,
  messages,
  userCases,
  loadCases,
  startVoice,
  startChat,
  selectCase,
}: IdleStateProps) {
  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "20px 20px 200px",
        display: "flex",
        flexDirection: "column",
        background: "#F4F5F3",
      }}
    >
      {/* Top Advisory Banner */}
      <div
        style={{
          background: "#FCEBB6",
          borderRadius: 14,
          padding: "12px 14px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <span style={{ fontSize: 20 }}>🚨</span>
        <div style={{ flex: 1 }}>
          <p style={{ margin: "0 0 2px", fontSize: 12, fontWeight: 700, color: "#7a4d00" }}>
            Golden Hour Alert: Helpline 1930
          </p>
          <p style={{ margin: 0, fontSize: 11, color: "#7a4d00", lineHeight: 1.4 }}>
            Report financial fraud within 2 hours to freeze fraudulent money before withdrawal.
          </p>
        </div>
      </div>

      {/* Main Mic / Action Orb */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginBottom: 28,
        }}
      >
        <div style={{ position: "relative", marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => {
              if (caseId) {
                startVoice(caseId, language);
              } else {
                selectCase("");
              }
            }}
            style={{
              position: "relative",
              zIndex: 1,
              width: 110,
              height: 110,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #146B66, #1D8577)",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 40,
              boxShadow: "0 8px 30px rgba(20, 107, 102, 0.4)",
            }}
            aria-label="Start live voice conversation"
          >
            🎙️
          </button>
        </div>
        <p style={{ fontSize: 13, fontWeight: 700, color: "#146B66", margin: 0 }}>
          Tap Orb to Start Voice Conversation
        </p>
      </div>

      {/* Common Scam Incident Categories */}
      <p
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#5B6B68",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          margin: "0 0 10px",
        }}
      >
        Report By Category
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: 10,
          marginBottom: 24,
        }}
      >
        {[
          { icon: "💸", label: "Lost Money / UPI Fraud", desc: "Unauthorized debit or QR scan" },
          { icon: "⚡", label: "Utility / Electricity Bill", desc: "SMS threatening disconnection" },
          { icon: "💼", label: "Part-Time Job / Telegram", desc: "Fake task or investment schemes" },
          { icon: "🛑", label: "Blackmail / Digital Arrest", desc: "Video call or police impersonation" },
        ].map((t, idx) => (
          <div
            key={idx}
            onClick={() => {}}
            style={{
              background: "#FFFFFF",
              borderRadius: 14,
              padding: 14,
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(11,46,46,0.06)",
              border: "1px solid #E6E8E6",
            }}
          >
            <div style={{ fontSize: 24, marginBottom: 6 }}>{t.icon}</div>
            <p style={{ margin: "0 0 3px", fontSize: 13, fontWeight: 700, color: "#16211F" }}>
              {t.label}
            </p>
            <p style={{ margin: 0, fontSize: 11, color: "#5B6B68", lineHeight: 1.3 }}>{t.desc}</p>
          </div>
        ))}
      </div>

      {/* Recent Real Cases Section */}
      {userCases && userCases.length > 0 && (
        <div>
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#5B6B68",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              margin: "0 0 10px",
            }}
          >
            Your Filed Complaints ({userCases.length})
          </p>
          {userCases.slice(0, 5).map((c: any) => (
            <div
              key={c.id}
              onClick={() => selectCase(c.id)}
              style={{
                background: "#FFFFFF",
                borderRadius: 14,
                padding: "12px 14px",
                marginBottom: 10,
                cursor: "pointer",
                border: "1px solid #E6E8E6",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 700, color: "#16211F" }}>
                  {c.category}
                </p>
                <p style={{ margin: 0, fontSize: 11, color: "#5B6B68" }}>
                  {c.trackingNumber || `Case ID: ${c.id}`} • {c.amount || "Amount not provided"}
                </p>
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  background: "#E3F3EF",
                  color: "#146B66",
                  padding: "4px 8px",
                  borderRadius: 8,
                }}
              >
                {c.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
