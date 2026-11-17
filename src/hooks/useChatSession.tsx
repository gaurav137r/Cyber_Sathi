import { useState, useCallback } from "react";
import type { ChatMessage } from "../context/ConversationContext";

export function useChatSession() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<string | null>(null);

  const sendMessage = useCallback(async (message: string) => {
    if (!message.trim()) return;
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      text: message.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);
    try {
      const mockReply = `Thank you for: "${message.trim()}". How can I help?`;
      const agentMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: "agent",
        text: mockReply,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages(prev => [...prev, agentMsg]);
      setTimeout(() => setIsTyping(false), 800);
    } catch (error) {
      setIsTyping(false);
    }
  }, []);

  const sendVoiceText = useCallback(async (text: string) => {
    if (!text.trim()) return;
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);
    try {
      const mockReply = `I heard you say: "${text.trim()}". How can I help?`;
      const agentMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: "agent",
        text: mockReply,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages(prev => [...prev, agentMsg]);
      setTimeout(() => setIsTyping(false), 800);
    } catch (error) {
      setIsTyping(false);
    }
  }, []);

  const clearPendingAttachment = useCallback(() => setPendingAttachment(null), []);

  return { messages, isTyping, pendingAttachment, sendMessage, sendVoiceText, clearPendingAttachment };
}
