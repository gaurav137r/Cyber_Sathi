import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from "react";
import type { SathiResponse } from "../lib/sathi";
import { getSathiContext, type SathiContext } from "../lib/profile";
import { apiRequest } from "../lib/api";

function buildPersonalizedGreeting(
  context: SathiContext | null,
  language: "en" | "hi" | "bn",
  fallback: string,
): string {
  const hi = language === "hi"
  const parts: string[] = []
  if (context?.fullName) {
    parts.push(
      hi
        ? `नमस्ते ${context.fullName} जी।`
        : `Hello ${context.fullName}.`,
    )
  } else {
    parts.push(hi ? "नमस्ते।" : "Hello.")
  }
  if (context?.mobile) {
    parts.push(
      hi
        ? `क्या यह आपके रजिस्टर नंबर ${context.mobile} पर है?`
        : `Is this your registered number ${context.mobile}?`,
    )
  }
  if (context?.city && context?.district) {
    parts.push(
      hi
        ? `मैं देख रहा हूँ कि आप ${context.city}, ${context.district} से हैं।`
        : `I see you're from ${context.city}, ${context.district}.`,
    )
  }
  parts.push(fallback)
  return parts.join(" ")
}

export type ConversationScreen = "idle" | "voice" | "chat" | "review";

export interface ChatMessage {
  id: string;
  role: "user" | "agent" | "system";
  text: string;
  timestamp: string;
  type?: "system" | "evidence";
  /** Audio URL for voice turns (not needed for text) */
  audioUrl?: string;
}

interface ConversationContextValue {
  screen: ConversationScreen;
  caseId: string | null;
  language: "en" | "hi" | "bn";
  messages: ChatMessage[];
  isTyping: boolean;
  voiceSession: any | null;
  liveSession: SathiResponse["live"] | null;
  voiceError: string | null;
  toast: string | null;

  // Navigation
  setScreen: (screen: ConversationScreen) => void;
  setCaseId: (id: string | null) => void;
  setLanguage: (lang: "en" | "hi" | "bn") => void;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setTyping: (typing: boolean) => void;
  setVoiceSession: (session: any | null) => void;
  setLiveSession: (session: SathiResponse["live"] | null) => void;
  setVoiceError: (error: string | null) => void;
  setToast: (toast: string | null) => void;

  // Actions
  startVoice: (caseId: string, language: string) => Promise<void>;
  endVoice: () => Promise<void>;
  switchToChat: () => void;
  startChat: (caseId: string, language: string) => Promise<void>;
  goBack: () => void;
  selectCase: (caseId: string) => void;
  addMessage: (message: ChatMessage) => void;
  appendMessage: (role: "user" | "agent", text: string) => void;
  clearMessages: () => void;
  setToastMessage: (toast: string | null) => void;
}

const ConversationContext = createContext<ConversationContextValue | null>(null);

export function ConversationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [screen, setScreen] = useState<ConversationScreen>("idle");
  const [caseId, setCaseId] = useState<string | null>(null);
  const [language, setLanguage] = useState<"en" | "hi" | "bn">("en");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [voiceSession, setVoiceSession] = useState<any>(null);
  const [liveSession, setLiveSession] = useState<SathiResponse["live"] | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((t: string) => setToast(t), []);
  const hideToast = useCallback(() => setToast(null), []);

  // Auto-hide toast after 3s
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(hideToast, 3000);
    return () => clearTimeout(timer);
  }, [toast, hideToast]);

  // Clear messages when switching to idle
  useEffect(() => {
    if (screen === "idle") {
      setMessages([]);
    }
  }, [screen]);

  const startVoice = useCallback(
    async (caseId: string, language: string) => {
      if (!caseId) return;
      setCaseId(caseId);
      setScreen("voice");
      setVoiceError(null);
      setIsTyping(true);

      try {
        const session = await apiRequest<SathiResponse>(
          `/cases/${encodeURIComponent(caseId)}/sathi/session`,
          {
            method: "POST",
            body: JSON.stringify({ language, provider: "bland" }),
          },
        );

        // Save the session info for voice startup
        setVoiceSession(session);
        setLiveSession(session.live || null);
        setIsTyping(false);

        // Fetch the user's profile for agent context (best-effort).
        let context: SathiContext | null = null
        try {
          context = await getSathiContext(caseId)
        } catch {
          // Context is optional; fall back to a generic greeting.
        }

        // Add the greeting message
        const greetingText = buildPersonalizedGreeting(
          context,
          language === "hi" ? "hi" : "en",
          session.reply || "Hello, I am Cyber Sathi. Please describe what happened.",
        )
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}`,
            role: "agent",
            text: greetingText,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
      } catch (error) {
        setVoiceError(
          error instanceof Error ? error.message : "Could not start voice session."
        );
        setIsTyping(false);
      }
    },
    [setCaseId, setScreen, setVoiceError, setIsTyping]
  );

  const endVoice = useCallback(async () => {
    if (voiceSession?.live) {
      // End the voice session gracefully
      try {
        await fetch(
          `${import.meta.env.VITE_API_URL || "http://localhost:3000"}/cases/${encodeURIComponent(caseId!)}/bland/session`,
          { method: "DELETE", headers: { Authorization: `Bearer ${voiceSession.authorization}` } }
        );
      } catch {
        // Ignore errors during voice end
      }
    }
    setVoiceSession(null);
    setLiveSession(null);
    setVoiceError(null);
    setScreen("idle");
    setCaseId(null);
    setMessages([]);
  }, [voiceSession, caseId, setVoiceSession, setLiveSession, setVoiceError, setScreen, setCaseId, setMessages]);

  const switchToChat = useCallback(() => {
    endVoice();
    setScreen("chat");
    showToast("Voice ended. You can continue in chat.");
  }, [endVoice, setScreen, showToast]);

  const startChat = useCallback(
    async (caseId: string, language: string) => {
      if (!caseId) return;
      setCaseId(caseId);
      setScreen("chat");
      setVoiceError(null);
      setIsTyping(false);
      setMessages([]);
      setVoiceSession(null);
      setLiveSession(null);

      // Add a greeting message
      const greetingText =
        language === "hi"
          ? "नमस्ते, मैं साइबर साथी हूँ। कृपया बताएं कि आपके साथ क्या धोखाधड़ी हुई है?"
          : language === "bn"
          ? "নমস্কার, আমি সাইবার সাথী। আপনার সাথে কী ধরনের সাইबेर জালিয়াতি হয়েছে তা বলুন।"
          : "Hello, I am Cyber Sathi. Please tell me what happened in your own words.";

      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}`,
          role: "agent",
          text: greetingText,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    },
    [setCaseId, setScreen, setVoiceError, setIsTyping, setMessages]
  );

  const goBack = useCallback(() => {
    setScreen("idle");
    setCaseId(null);
    setMessages([]);
    setVoiceSession(null);
    setLiveSession(null);
    setVoiceError(null);
  }, [setScreen, setCaseId, setMessages, setVoiceSession, setLiveSession, setVoiceError]);

  const selectCase = useCallback((caseId: string) => {
    setCaseId(caseId);
    setScreen("review");
    setMessages([]);
    setVoiceSession(null);
    setLiveSession(null);
    setVoiceError(null);
  }, [setCaseId, setScreen, setMessages, setVoiceSession, setLiveSession, setVoiceError]);

  const addMessage = useCallback((message: ChatMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const appendMessage = useCallback(
    (role: "user" | "agent", text: string) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === role && !last.text.endsWith(text)) {
          return prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, text: m.text + text } : m
          );
        }
        return [
          ...prev,
          {
            id: `msg-${Date.now()}-${role}`,
            role,
            text,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ];
      });
    },
    []
  );

  const clearMessages = useCallback(() => setMessages([]), []);

  const value: ConversationContextValue = {
    screen,
    caseId,
    language,
    messages,
    isTyping,
    voiceSession,
    liveSession,
    voiceError,
    toast,
    setScreen,
    setCaseId,
    setLanguage,
    setMessages,
    setTyping: setIsTyping,
    setVoiceSession,
    setLiveSession,
    setVoiceError,
    setToast,
    startVoice,
    endVoice,
    switchToChat,
    startChat,
    goBack,
    selectCase,
    addMessage,
    appendMessage,
    clearMessages,
    setToastMessage: setToast,
  };

  return <ConversationContext.Provider value={value}>{children}</ConversationContext.Provider>;
}

export function useConversation(): ConversationContextValue {
  const ctx = useContext(ConversationContext);
  if (!ctx) throw new Error("useConversation must be used within ConversationProvider");
  return ctx;
}
