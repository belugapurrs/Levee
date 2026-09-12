"use client";

import { motion, useReducedMotion } from "framer-motion";

export type FlowPhase = "idle" | "holding" | "blocked" | "spending";

const AVAILABLE_PARTICLES = [
  { top: 26, delay: 0, duration: 2.9 },
  { top: 44, delay: 0.7, duration: 3.4 },
  { top: 16, delay: 1.4, duration: 3.1 },
  { top: 54, delay: 2.1, duration: 3.6 },
  { top: 35, delay: 2.6, duration: 2.7 },
];

const HELD_PARTICLES = [
  { top: 22, left: 24, duration: 16 },
  { top: 46, left: 58, duration: 21 },
  { top: 33, left: 80, duration: 18 },
];

export function FlowChannel({
  freeRatio,
  phase = "idle",
  hasMoney = true,
}: {
  freeRatio: number;
  phase?: FlowPhase;
  hasMoney?: boolean;
}) {
  const reduced = useReducedMotion();
  const ratio = Math.min(1, Math.max(0, freeRatio));
  const availablePct = hasMoney ? ratio * 100 : 0;

  const boundaryColor =
    phase === "blocked" ? "var(--error)" : phase === "holding" ? "var(--blue)" : "var(--text)";

  const boundaryGlow =
    phase === "blocked"
      ? "0 0 0 4px rgba(220, 38, 38, 0.18)"
      : phase === "holding"
        ? "0 0 0 4px rgba(37, 99, 235, 0.22)"
        : "0 0 0 0 rgba(0,0,0,0)";

  return (
    <div
      style={{
        position: "relative",
        height: 76,
        borderRadius: 12,
        overflow: "hidden",
        background: "#e8edf6",
        border: "1px solid var(--border)",
      }}
    >
      {/* Held region: contained, faintly ruled so it reads as structure, not emptiness. */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        {Array.from({ length: 14 }, (_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${(i + 1) * 7}%`,
              width: 1,
              background: "rgba(17,24,39,0.05)",
            }}
          />
        ))}
        {!reduced &&
          hasMoney &&
          ratio < 1 &&
          HELD_PARTICLES.map((p, i) => (
            <motion.span
              key={i}
              style={{
                position: "absolute",
                top: p.top,
                left: `${Math.max(availablePct, 0) + ((100 - availablePct) * p.left) / 100}%`,
                width: 4,
                height: 4,
                borderRadius: 2,
                background: "#b6c2d9",
              }}
              animate={{ x: [0, 5, 0], opacity: [0.5, 0.8, 0.5] }}
              transition={{ duration: p.duration, repeat: Infinity, ease: "easeInOut" }}
            />
          ))}
      </div>

      {/* Available region: money that can still leave. */}
      <motion.div
        initial={false}
        animate={{ width: `${availablePct}%` }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          overflow: "hidden",
          background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
        }}
      >
        {!reduced &&
          hasMoney &&
          AVAILABLE_PARTICLES.map((p, i) => (
            <motion.span
              key={`${phase}-${i}`}
              style={{
                position: "absolute",
                top: p.top,
                left: 0,
                width: 10,
                height: 4,
                borderRadius: 2,
                background: "rgba(255,255,255,0.7)",
              }}
              initial={{ left: "-12%", opacity: 0 }}
              animate={
                phase === "blocked"
                  ? { left: ["-12%", "92%"], opacity: [0, 1, 1] }
                  : phase === "spending"
                    ? { left: ["-12%", "112%"], opacity: [0, 1, 0] }
                    : { left: ["-12%", "108%"], opacity: [0, 0.9, 0] }
              }
              transition={
                phase === "blocked"
                  ? { duration: 0.6, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }
                  : {
                      duration: phase === "spending" ? 1 : p.duration,
                      delay: phase === "spending" ? i * 0.05 : p.delay,
                      repeat: phase === "spending" ? 0 : Infinity,
                      ease: "linear",
                    }
              }
            />
          ))}
      </motion.div>

      {/* The levee: the boundary held money cannot cross. */}
      {hasMoney && ratio > 0 && ratio < 1 && (
        <motion.div
          initial={false}
          animate={{ left: `${availablePct}%`, backgroundColor: boundaryColor, boxShadow: boundaryGlow }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            width: 3,
            marginLeft: -1.5,
            background: "var(--text)",
            borderRadius: 2,
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 0,
              left: -3.5,
              width: 10,
              height: 3,
              borderRadius: 2,
              background: "inherit",
            }}
          />
          <span
            style={{
              position: "absolute",
              bottom: 0,
              left: -3.5,
              width: 10,
              height: 3,
              borderRadius: 2,
              background: "inherit",
            }}
          />
        </motion.div>
      )}
    </div>
  );
}
