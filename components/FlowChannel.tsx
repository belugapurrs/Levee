"use client";

import { motion, useReducedMotion } from "framer-motion";

export type FlowPhase = "idle" | "adding" | "holding" | "spending" | "releasing" | "blocked";

/**
 * A continuous, very low-opacity sheen drifting left → right inside the Available fill.
 * Unlike the transactional particles below, this always runs — it reads as the same
 * money quietly moving toward the boundary, not as a state change, so it stays subtle
 * and never competes with the one-shot bursts.
 */
function AmbientFlow() {
  return (
    <motion.div
      aria-hidden
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        width: "45%",
        background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.24), transparent)",
        filter: "blur(7px)",
        mixBlendMode: "screen",
        pointerEvents: "none",
      }}
      initial={{ left: "-45%" }}
      animate={{ left: "100%" }}
      transition={{ duration: 7, repeat: Infinity, repeatType: "loop", ease: "easeInOut" }}
    />
  );
}

type Particle = { top: number; delay: number };

const PARTICLES: Particle[] = [
  { top: 20, delay: 0 },
  { top: 38, delay: 0.06 },
  { top: 46, delay: 0.12 },
  { top: 30, delay: 0.18 },
];

/**
 * Particles only ever play once, for the phase that names an actual balance change
 * (add/hold/spend/release). "idle" renders none — a calm dashboard is the point.
 */
function TransientParticles({
  phase,
  availablePct,
}: {
  phase: Exclude<FlowPhase, "idle">;
  availablePct: number;
}) {
  const boundary = `${availablePct}%`;

  const anim: { from: string; to: string; fadeOut?: boolean } =
    phase === "adding"
      ? { from: "-10%", to: `${Math.max(8, availablePct * 0.55)}%` }
      : phase === "holding"
        ? { from: `${Math.max(6, availablePct * 0.35)}%`, to: `${Math.min(availablePct + 8, 96)}%` }
        : phase === "spending"
          ? { from: `${Math.max(6, availablePct * 0.25)}%`, to: "112%", fadeOut: true }
          : phase === "releasing"
            ? { from: `${Math.min(availablePct + 14, 96)}%`, to: `${Math.max(availablePct * 0.4, 6)}%` }
            : { from: "4%", to: boundary }; // blocked: approaches and stops at the real boundary

  return (
    <>
      {PARTICLES.map((p, i) => (
        <motion.span
          key={`${phase}-${i}`}
          style={{
            position: "absolute",
            top: p.top,
            width: 10,
            height: 4,
            borderRadius: 2,
            background: phase === "blocked" ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.75)",
          }}
          initial={{ left: anim.from, opacity: 0 }}
          animate={{
            left: [anim.from, anim.to],
            opacity: anim.fadeOut ? [0, 1, 0] : [0, 1, 1],
          }}
          transition={{ duration: 0.65, delay: p.delay, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}
    </>
  );
}

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

  // The bar itself always stays dark so it reads against both the blue Available fill
  // and the light Held background — recoloring it blue on "active" made it disappear
  // into the fill it was supposed to be cutting across. Only the glow signals activity.
  const boundaryColor = phase === "blocked" ? "var(--error)" : "var(--text)";

  const boundaryGlow =
    phase === "blocked"
      ? "0 0 0 4px rgba(220, 38, 38, 0.18)"
      : phase !== "idle"
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
      {/* Held region: contained and still — no motion here at rest. */}
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
          background: "var(--blue)",
        }}
      >
        {!reduced && hasMoney && <AmbientFlow />}
        {!reduced && hasMoney && phase !== "idle" && (
          <TransientParticles phase={phase} availablePct={availablePct} />
        )}
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
            width: 4,
            marginLeft: -2,
            background: "var(--text)",
            borderRadius: 2,
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 0,
              left: -4,
              width: 12,
              height: 3,
              borderRadius: 2,
              background: "inherit",
            }}
          />
          <span
            style={{
              position: "absolute",
              bottom: 0,
              left: -4,
              width: 12,
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
