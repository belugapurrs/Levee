"use client";

import { useEffect, useRef, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, MessageCircle, X } from "lucide-react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
};

const SUGGESTIONS = [
  "Can I spend 0.005 ETH right now?",
  "When does my next commitment unlock?",
  "Why can't I spend more?",
];

function ThinkingDots() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 0" }}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-3)" }}
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
}

function bubbleStyle(role: ChatMessage["role"], isError?: boolean): React.CSSProperties {
  const base: React.CSSProperties = {
    maxWidth: "82%",
    padding: "10px 14px",
    borderRadius: 14,
    fontSize: 14,
    lineHeight: "20px",
    wordBreak: "break-word",
    whiteSpace: "pre-wrap",
  };
  if (role === "user") {
    return { ...base, background: "var(--text)", color: "var(--white)", borderBottomRightRadius: 4 };
  }
  if (isError) {
    return { ...base, background: "var(--error-bg)", color: "var(--error)", borderBottomLeftRadius: 4 };
  }
  return { ...base, background: "var(--bg)", color: "var(--text)", borderBottomLeftRadius: 4 };
}

export function ChatPanel() {
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();
  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);
  const nextId = () => `msg-${++idRef.current}`;

  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending, open]);

  async function send(raw: string) {
    const question = raw.trim();
    if (!question || pending || !embeddedWallet) return;

    setMessages((prev) => [...prev, { id: nextId(), role: "user", content: question }]);
    setInput("");
    setPending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, walletAddress: embeddedWallet.address }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Something went wrong. Try again.");
      }
      setMessages((prev) => [...prev, { id: nextId(), role: "assistant", content: data.answer }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "assistant",
          content: err instanceof Error ? err.message : "Something went wrong. Try again.",
          isError: true,
        },
      ]);
    } finally {
      setPending(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    send(input);
  }

  if (!authenticated || !embeddedWallet) return null;

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close chat" : "Ask Levee"}
        whileTap={{ scale: 0.96 }}
        transition={{ duration: 0.1 }}
        style={{
          position: "fixed",
          right: 20,
          bottom: "calc(var(--nav-h) + 20px)",
          zIndex: 30,
          width: 52,
          height: 52,
          borderRadius: "50%",
          border: 0,
          background: "var(--text)",
          color: "var(--white)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 8px 20px rgba(17,24,39,0.18)",
          cursor: "pointer",
        }}
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="chat-panel"
            role="dialog"
            aria-label="Ask Levee"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: "fixed",
              right: 20,
              bottom: "calc(var(--nav-h) + 84px)",
              zIndex: 30,
              width: "min(380px, calc(100vw - 40px))",
              height: "min(560px, calc(100dvh - var(--nav-h) - 120px))",
              background: "var(--white)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              boxShadow: "0 12px 32px rgba(17,24,39,0.14)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 16px",
                borderBottom: "1px solid var(--border)",
                flex: "none",
              }}
            >
              <span className="section-heading">Ask Levee</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "none",
                  border: 0,
                  padding: 4,
                  borderRadius: 8,
                  color: "var(--text-2)",
                  cursor: "pointer",
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div
              ref={listRef}
              style={{
                flex: 1,
                overflowY: "auto",
                padding: 16,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {messages.length === 0 && (
                <div style={{ padding: "8px 2px" }}>
                  <p className="body-sm">Ask about your balance, your holds, or what you can spend right now.</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="pill"
                        onClick={() => send(s)}
                        style={{
                          width: "100%",
                          height: "auto",
                          padding: "10px 14px",
                          justifyContent: "flex-start",
                          textAlign: "left",
                          whiteSpace: "normal",
                          lineHeight: "18px",
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m) => (
                <div key={m.id} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                  <div style={bubbleStyle(m.role, m.isError)}>{m.content}</div>
                </div>
              ))}

              {pending && (
                <div style={{ display: "flex", justifyContent: "flex-start" }}>
                  <div style={bubbleStyle("assistant")}>
                    <ThinkingDots />
                  </div>
                </div>
              )}
            </div>

            <form
              onSubmit={handleSubmit}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: 12,
                borderTop: "1px solid var(--border)",
                flex: "none",
              }}
            >
              <input
                className="input"
                style={{ height: 44, fontSize: 14, fontWeight: 400 }}
                placeholder="Ask a question…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={pending}
              />
              <button
                type="submit"
                className="btn"
                disabled={pending || !input.trim()}
                aria-label="Send"
                style={{ width: 44, height: 44, padding: 0, borderRadius: 10, flex: "none" }}
              >
                <ArrowUp size={18} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
