import React, { useState } from "react";
import { useConversation } from "../context/ConversationContext";

interface CaseReviewPanelProps {
  caseId: string | null;
  language: "en" | "hi" | "bn";
  messages: any[];
  startVoice: () => void;
  goBack: () => void;
  selectCase: (caseId: string) => void;
}

export function CaseReviewPanel({
  caseId,
  language,
  messages,
  startVoice,
  goBack,
  selectCase,
}: CaseReviewPanelProps) {
  const [editing, setEditing] = useState(false);
  const [editedFields, setEditedFields] = useState({
    category: "",
    amount: "",
    suspectPhone: "",
    suspectUpi: "",
    suspectDetails: "",
    platform: "",
    incidentDate: "",
    summary: "",
    complaintNarrative: "",
    actionRequested: "",
  });

  const handleSave = () => {
    setEditing(false);
    // TODO: Save edited fields to backend
  };

  const handleGeneratePost = () => {
    // TODO: Generate social post via backend
  };

  const handleFileNCRP = () => {
    // TODO: File on NCRP portal (future)
  };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: "#F4F5F3",
        overflowY: "auto",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "#FFFFFF",
          padding: "16px 20px",
          borderBottom: "1px solid #E6E8E6",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#16211F" }}>
            Review & Edit Report
          </h2>
          <p style={{ margin: 0, fontSize: 12, color: "#5B6B68", marginTop: 2 }}>
            Case: {caseId || "—"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              style={{
                padding: "8px 14px",
                borderRadius: 20,
                border: "1px solid #146B66",
                background: "#FFFFFF",
                color: "#146B66",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Edit Fields
            </button>
          ) : (
            <button
              onClick={handleSave}
              style={{
                padding: "8px 14px",
                borderRadius: 20,
                border: "1px solid #146B66",
                background: "#146B66",
                color: "#FFFFFF",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Save
            </button>
          )}
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

      {/* Report Content */}
      <div style={{ padding: "20px", maxWidth: 720, margin: "0 auto" }}>
        {/* Summary Card */}
        <div
          style={{
            background: "#F4F5F3",
            borderRadius: 16,
            padding: "16px",
            border: "1px solid #E6E8E6",
          }}
        >
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#146B66" }}>
            Report Summary
          </h3>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "#16211F" }}>
            {editedFields.summary || "No summary available. Speak with Saathi to generate a report."}
          </p>
        </div>

        {/* Structured Fields */}
        <div
          style={{
            background: "#FFFFFF",
            borderRadius: 16,
            padding: "16px",
            border: "1px solid #E6E8E6",
            marginTop: 16,
          }}
        >
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#146B66" }}>
            Structured Fields
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#5B6B68", display: "block", marginBottom: 4 }}>
                Category
              </label>
              <input
                type="text"
                value={editedFields.category}
                onChange={(e) => setEditedFields({ ...editedFields, category: e.target.value })}
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #E6E8E6" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#5B6B68", display: "block", marginBottom: 4 }}>
                Amount
              </label>
              <input
                type="text"
                value={editedFields.amount}
                onChange={(e) => setEditedFields({ ...editedFields, amount: e.target.value })}
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #E6E8E6" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#5B6B68", display: "block", marginBottom: 4 }}>
                Suspect Phone
              </label>
              <input
                type="text"
                value={editedFields.suspectPhone}
                onChange={(e) => setEditedFields({ ...editedFields, suspectPhone: e.target.value })}
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #E6E8E6" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#5B6B68", display: "block", marginBottom: 4 }}>
                Suspect UPI
              </label>
              <input
                type="text"
                value={editedFields.suspectUpi}
                onChange={(e) => setEditedFields({ ...editedFields, suspectUpi: e.target.value })}
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #E6E8E6" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#5B6B68", display: "block", marginBottom: 4 }}>
                Platform / App
              </label>
              <input
                type="text"
                value={editedFields.platform}
                onChange={(e) => setEditedFields({ ...editedFields, platform: e.target.value })}
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #E6E8E6" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#5B6B68", display: "block", marginBottom: 4 }}>
                Incident Date
              </label>
              <input
                type="text"
                value={editedFields.incidentDate}
                onChange={(e) => setEditedFields({ ...editedFields, incidentDate: e.target.value })}
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #E6E8E6" }}
              />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#5B6B68", display: "block", marginBottom: 4 }}>
              Complaint Narrative
            </label>
            <textarea
              value={editedFields.complaintNarrative}
              onChange={(e) => setEditedFields({ ...editedFields, complaintNarrative: e.target.value })}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #E6E8E6", minHeight: 80, resize: "vertical" }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#5B6B68", display: "block", marginBottom: 4 }}>
              Summary
            </label>
            <textarea
              value={editedFields.summary}
              onChange={(e) => setEditedFields({ ...editedFields, summary: e.target.value })}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #E6E8E6", minHeight: 80, resize: "vertical" }}
            />
          </div>
        </div>

        {/* Actions */}
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            marginTop: 16,
            paddingTop: 16,
            borderTop: "1px solid #E6E8E6",
          }}
        >
          <button
            onClick={handleGeneratePost}
            style={{
              flex: 1,
              minWidth: 120,
              padding: "12px 20px",
              borderRadius: 24,
              border: "1px solid #146B66",
              background: "#146B66",
              color: "#FFFFFF",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Generate Social Post
          </button>
          <button
            onClick={handleFileNCRP}
            style={{
              flex: 1,
              minWidth: 120,
              padding: "12px 20px",
              borderRadius: 24,
              border: "1px solid #E6E8E6",
              background: "#FFFFFF",
              color: "#5B6B68",
              fontSize: 14,
              fontWeight: 700,
              cursor: "not-allowed",
            }}
          >
            File on NCRP (Soon)
          </button>
          <button
            onClick={startVoice}
            style={{
              padding: "12px 20px",
              borderRadius: 24,
              border: "1px solid #146B66",
              background: "#146B66",
              color: "#FFFFFF",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            🎙️ Start Voice
          </button>
        </div>
      </div>
    </div>
  );
}
