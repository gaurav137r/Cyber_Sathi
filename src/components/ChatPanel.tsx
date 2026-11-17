import React, { useRef, useState } from "react";
import { useConversation } from "../context/ConversationContext";
import { useChatSession } from "../hooks/useChatSession";
import { openCaseEvents } from "../lib/case-interactions";
import { EvidenceUploadModal } from "./EvidenceUploadModal";

interface ChatPanelProps {
  className?: string;
  caseId: string | null;
  language: "en" | "hi" | "bn";
  messages: any[];
  isTyping: boolean;
  voiceSession: any | null;
  liveSession: any | null;
  voiceError: string | null;
  startVoice: () => void;
  goBack: () => void;
  selectCase: (caseId: string) => void;
}

export function ChatPanel({
  caseId,
  language,
  messages,
  isTyping,
  voiceSession,
  liveSession,
  voiceError,
  startVoice,
  goBack,
  selectCase,
}: ChatPanelProps) {
  const {
    toast,
    setToast,
  } = useConversation();
  const {
    messages: chatMessages,
    isTyping: chatIsTyping,
    pendingAttachment,
    sendMessage,
    clearPendingAttachment,
  } = useChatSession();

  const [showEvidenceModal, setShowEvidenceModal] = useState(false);
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || !caseId) return;
    setInputText("");
    await sendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isTyping]);

  // Open the evidence upload popup automatically when Saathi asks for
  // evidence (for example screen recordings / screenshots) during the call.
  React.useEffect(() => {
    if (!caseId) return;
    const close = openCaseEvents(
      caseId,
      null,
      (event) => {
        const type = typeof event?.type === "string" ? event.type : "";
        const action = typeof event?.action === "string" ? event.action : "";
        const wantsEvidence =
          type === "case.evidence_requested" ||
          action === "SAATHI_EVIDENCE_REQUESTED";
        if (wantsEvidence) setShowEvidenceModal(true);
      },
      () => undefined,
    );
    return () => close();
  }, [caseId]);

  return (
    <div
      className="chat-panel"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: "#F4F5F3",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "#FFFFFF",
          padding: "12px 16px",
          borderBottom: "1px solid #E6E8E6",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #146B66, #1D8577)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#FFFFFF",
              fontSize: 20,
              flexShrink: 0,
            }}
          >
            🛡️
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#16211F" }}>Saathi</h2>
            <p style={{ margin: 0, fontSize: 11, color: "#5B6B68" }}>
              Case: {caseId || "—"}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={startVoice}
            disabled={!caseId}
            style={{
              padding: "8px 14px",
              borderRadius: 20,
              border: "1px solid #146B66",
              background: "#FFFFFF",
              color: "#146B66",
              fontSize: 12,
              fontWeight: 700,
              cursor: !caseId ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            🎙️ Start Voice
          </button>
          <button
            onClick={goBack}
            style={{
              padding: "8px 14px",
              borderRadius: 20,
              border: "1px solid #E6E8E6",
              background: "#FFFFFF",
              color: "#5B6B68",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            ← Back
          </button>
        </div>
      </div>

      {/* Message Area */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {chatMessages.map((msg: any, idx: number) => {
          const isAgent = msg.role === "agent";
          const isSystem = msg.role === "system";
          const isEvidence = msg.role === "evidence";

          if (isSystem || isEvidence) {
            return (
              <div
                key={idx}
                style={{
                  textAlign: "center",
                  fontSize: 11,
                  color: "#5B6B68",
                  fontStyle: "italic",
                  padding: "4px 0",
                }}
              >
                {msg.text}
              </div>
            );
          }

          return (
            <div
              key={msg.id || idx}
              style={{
                display: "flex",
                justifyContent: isAgent ? "flex-start" : "flex-end",
                maxWidth: "85%",
                animation: "fadeIn 0.2s",
              }}
            >
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 16,
                  wordWrap: "break-word",
                  lineHeight: 1.5,
                  backgroundColor: isAgent
                    ? "rgba(189, 195, 199, 0.6)"
                    : "linear-gradient(135deg, #146B66, #1D8577)",
                  color: isAgent ? "#16211F" : "#FFFFFF",
                  boxShadow: isAgent ? "0 1px 4px rgba(0,0,0,0.06)" : "0 4px 12px rgba(20,107,102,0.25)",
                  border: isAgent ? "1px solid #E6E8E6" : "none",
                  maxWidth: "100%",
                }}
              >
                {msg.text}
              </div>
            </div>
          );
        })}

        {isTyping && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "12px",
              background: "#FFFFFF",
              borderRadius: 16,
              border: "1px solid #E6E8E6",
            }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: "#146B66",
                animation: "blink 1s infinite",
              }}
            />
            <span style={{ fontSize: 12, color: "#5B6B68" }}>Saathi is typing...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div
        style={{
          background: "#FFFFFF",
          borderTop: "1px solid #E6E8E6",
          padding: "12px",
          display: "flex",
          gap: 10,
          alignItems: "flex-end",
        }}
      >
        <div style={{ flex: 1, display: "flex", gap: 8, alignItems: "flex-end" }}>
          <button
            onClick={() => setShowEvidenceModal(true)}
            style={{
              padding: "8px",
              borderRadius: 12,
              border: "1px solid #E6E8E6",
              background: "#FFFFFF",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title="Upload evidence"
          >
            📎
          </button>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            style={{
              flex: 1,
              maxHeight: 100,
              overflowY: "auto",
              padding: "10px 14px",
              borderRadius: 20,
              border: "1.5px solid #E6E8E6",
              backgroundColor: "#F4F5F3",
              color: "#16211F",
              fontSize: 14,
              outline: "none",
              resize: "none",
            }}
            rows={2}
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || !caseId}
            style={{
              padding: "10px 16px",
              borderRadius: 20,
              border: "none",
              background: "#146B66",
              color: "#FFFFFF",
              fontSize: 16,
              fontWeight: 700,
              cursor: (!inputText.trim() || !caseId) ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            Send
          </button>
        </div>
        <button
          onClick={clearPendingAttachment}
          style={{
            padding: "8px",
            borderRadius: 12,
            border: "1px solid #E6E8E6",
            background: "#FFFFFF",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ✕
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 80,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "10px 20px",
            borderRadius: 20,
            background: "#146B66",
            color: "#FFFFFF",
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "0 4px 12px rgba(20,107,102,0.3)",
            zIndex: 1000,
          }}
        >
          {toast}
        </div>
      )}

      {/* Evidence Upload Modal */}
      <EvidenceUploadModal
        visible={showEvidenceModal}
        caseId={caseId}
        onClose={() => setShowEvidenceModal(false)}
        onUploaded={() => {
          clearPendingAttachment();
          setShowEvidenceModal(false);
        }}
        language={language}
      />
    </div>
  );
}
