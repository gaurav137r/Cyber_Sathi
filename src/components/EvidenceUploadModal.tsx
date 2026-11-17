import React, { useRef, useState } from "react";
import { useConversation } from "../context/ConversationContext";
import { apiRequest } from "../lib/api";
import type { EvidenceItem } from "../lib/evidence";

interface EvidenceUploadModalProps {
  visible: boolean;
  caseId: string | null;
  language: "en" | "hi" | "bn";
  onClose: () => void;
  onUploaded: () => void;
}

export function EvidenceUploadModal({
  visible,
  caseId,
  language,
  onClose,
  onUploaded,
}: EvidenceUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedEvidence, setUploadedEvidence] = useState<any[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // Close modal when Escape is pressed
  React.useEffect(() => {
    if (!visible) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [visible, onClose]);

  if (!visible) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) setFile(droppedFile);
  };

  const handleSubmit = async () => {
    if (!file || !caseId) {
      setError("Please select a file first.");
      return;
    }
    setUploading(true);
    setError("");
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (description.trim()) {
        formData.append("description", description.trim());
      }

      const result = await apiRequest<EvidenceItem>(
        `/cases/${encodeURIComponent(caseId)}/evidence`,
        { method: "POST", body: formData },
      );
      setUploadedEvidence((prev) => [...prev, result]);
      setFile(null);
      setDescription("");
      setUploadProgress(0);
      setUploading(false);
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setUploading(false);
    }
  };

  const isDropAccepted = (f: File) => {
    const accepted = [".jpg", ".jpeg", ".png", ".webp", ".pdf", ".mp3", ".wav", ".ogg"];
    const ext = f.name.split(".").pop()?.toLowerCase();
    return accepted.includes(`.${ext}`);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 500,
          background: "#FFFFFF",
          borderRadius: 20,
          overflow: "hidden",
          boxShadow: "0 12px 48px rgba(0,0,0,0.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 20px",
            background: "#0B2E2E",
            color: "#FFFFFF",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            📎 Upload Evidence
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#FFFFFF",
              fontSize: 20,
              cursor: "pointer",
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* Drag & Drop Area */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          style={{
            padding: 20,
            textAlign: "center",
            border: `2px dashed ${dragOver ? "#146B66" : "#E6E8E6"}`,
            borderRadius: 12,
            background: dragOver ? "#E3F3EF" : "#F4F5F3",
            cursor: "copy",
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 8 }}>📁</div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#16211F" }}>
            Drop a file here, or click to browse
          </p>
          <p style={{ margin: 0, fontSize: 12, color: "#5B6B68", marginTop: 4 }}>
            Images, PDF, audio: JPG, PNG, WebP, PDF, MP3, WAV, OGG
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf,audio/mpeg,audio/wav,audio/ogg"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
        </div>

        {/* File Preview */}
        {file && (
          <div
            style={{
              padding: 16,
              background: "#F4F5F3",
              borderTop: "1px solid #E6E8E6",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 32 }}>
                {file.type.startsWith("image/") ? "🖼️" : file.type.startsWith("audio/") ? "🎵" : "📄"}
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#16211F" }}>
                  {file.name}
                </p>
                <p style={{ margin: 0, fontSize: 12, color: "#5B6B68" }}>
                  {(file.size / 1024).toFixed(1)} KB • {file.type}
                </p>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#5B6B68", display: "block" }}>
                Description (optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional: describe the evidence (e.g., what happened, dates, amounts)"
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid #E6E8E6",
                  backgroundColor: "#F4F5F3",
                  color: "#16211F",
                  fontSize: 13,
                  outline: "none",
                  resize: "vertical",
                  minHeight: 60,
                  marginTop: 6,
                }}
              />
            </div>
          </div>
        )}

        {/* Progress Bar */}
        {uploading && (
          <div style={{ padding: "12px 20px", background: "#F4F5F3", borderTop: "1px solid #E6E8E6" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: "#5B6B68" }}>Uploading...</span>
              <span style={{ fontSize: 12, color: "#146B66", fontWeight: 700 }}>
                {uploadProgress}%
              </span>
            </div>
            <div style={{ height: 4, background: "#E6E8E6", borderRadius: 2, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  background: "#146B66",
                  width: `${uploadProgress}%`,
                  transition: "width 0.2s",
                }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            style={{
              padding: "10px 20px",
              background: "#FDE8E7",
              color: "#E15347",
              borderRadius: 8,
              fontSize: 12,
              margin: "0 20px",
            }}
          >
            {error}
          </div>
        )}

        {/* Footer Actions */}
        <div
          style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "16px 20px" }}
        >
          <button
            onClick={onClose}
            disabled={uploading}
            style={{
              padding: "10px 20px",
              borderRadius: 20,
              border: "1px solid #E6E8E6",
              background: "#FFFFFF",
              color: "#5B6B68",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!file || uploading}
            style={{
              padding: "10px 20px",
              borderRadius: 20,
              border: "none",
              background: "#146B66",
              color: "#FFFFFF",
              fontSize: 14,
              fontWeight: 700,
              cursor: (!file || uploading) ? "not-allowed" : "pointer",
            }}
          >
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </div>

        {/* Uploaded Evidence List */}
        {uploadedEvidence.length > 0 && (
          <div
            style={{
              padding: "12px 20px",
              background: "#F4F5F3",
              borderTop: "1px solid #E6E8E6",
            }}
          >
            <p style={{ fontSize: 11, fontWeight: 700, color: "#5B6B68", margin: 0, marginBottom: 8 }}>
              📤 Uploaded Evidence
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {uploadedEvidence.map((ev: any, idx: number) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 10px",
                    background: "#FFFFFF",
                    borderRadius: 8,
                    border: "1px solid #E6E8E6",
                    fontSize: 11,
                    color: "#5B6B68",
                  }}
                >
                  {ev.type === "image" ? "🖼️" : ev.type === "audio" ? "🎵" : "📄"}
                  <span>{ev.fileName}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
