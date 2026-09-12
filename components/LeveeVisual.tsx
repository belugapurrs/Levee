"use client";

import { motion, useReducedMotion } from "framer-motion";
import { SPRING_SOFT, useSpringNumber } from "@/components/motion";

const W = 400;
const H = 132;

// An asymmetric ribbon rather than a rectangle: the form reads as something shaped by
// flow, while the boundary that cuts it reads as something built.
const SILHOUETTE =
  "M 10,40 C 70,18 140,14 205,22 C 262,29 330,16 390,32 C 396,58 396,84 390,104 C 332,120 252,110 190,113 C 122,117 56,122 12,104 C 4,84 4,60 10,40 Z";

export type LeveePhase = "idle" | "sealing" | "refused";

export function LeveeVisual({
  freeRatio,
  phase = "idle",
  pulseKey = 0,
}: {
  freeRatio: number;
  phase?: LeveePhase;
  pulseKey?: number;
}) {
  const reduced = useReducedMotion();
  const clamped = Math.min(1, Math.max(0, freeRatio));
  const split = useSpringNumber(clamped * W, SPRING_SOFT);

  const drift = reduced
    ? undefined
    : {
        animate: { x: [0, 14, 0], y: [0, -6, 0] },
        transition: { duration: 19, repeat: Infinity, repeatType: "mirror" as const, ease: "easeInOut" as const },
      };

  const driftSlow = reduced
    ? undefined
    : {
        animate: { x: [0, -10, 0], y: [0, 7, 0] },
        transition: { duration: 26, repeat: Infinity, repeatType: "mirror" as const, ease: "easeInOut" as const },
      };

  // On refusal the flow surges at the boundary and is held: the clip keeps it contained,
  // so the motion reads as pressure against a structure, never as a breach.
  const surge =
    phase === "refused" && !reduced
      ? { x: [0, 26, 0], transition: { duration: 1.1, ease: "easeInOut" as const } }
      : {};

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label={`${Math.round(clamped * 100)}% of your balance is free to spend, the rest is held`}
      style={{ display: "block", overflow: "visible" }}
    >
      <defs>
        <clipPath id="levee-shape">
          <path d={SILHOUETTE} />
        </clipPath>

        <clipPath id="levee-free">
          <motion.rect x={0} y={0} width={split} height={H} />
        </clipPath>

        <linearGradient id="levee-held-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--held-lift)" }} />
          <stop offset="100%" style={{ stopColor: "var(--held)" }} />
        </linearGradient>

        <linearGradient id="levee-free-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--free-lift)" }} />
          <stop offset="100%" style={{ stopColor: "var(--free)" }} />
        </linearGradient>

        <filter id="levee-soften" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="16" />
        </filter>
      </defs>

      <g clipPath="url(#levee-shape)">
        {/* Held: dense, still, faintly structured. Stillness is the point. */}
        <rect x={0} y={0} width={W} height={H} fill="url(#levee-held-fill)" />
        <g opacity={0.14}>
          {Array.from({ length: 26 }, (_, i) => (
            <rect key={i} x={i * 16} y={0} width={1} height={H} fill="#ffffff" />
          ))}
        </g>

        {/* Free: warm, soft, slowly moving. */}
        <g clipPath="url(#levee-free)">
          <rect x={0} y={0} width={W} height={H} fill="url(#levee-free-fill)" />
          <motion.g animate={surge}>
            <g filter="url(#levee-soften)" opacity={0.55}>
              <motion.ellipse cx={90} cy={54} rx={78} ry={40} fill="#f6cf92" {...drift} />
              <motion.ellipse cx={220} cy={88} rx={92} ry={44} fill="#b8451f" {...driftSlow} />
            </g>
          </motion.g>
        </g>
      </g>

      {/* The levee: a built boundary, drawn past the form so it reads as structure. */}
      <motion.g style={{ x: split }}>
        <motion.rect
          key={`seal-${pulseKey}`}
          x={-1.25}
          y={4}
          width={2.5}
          height={H - 8}
          rx={1.25}
          fill="var(--ink)"
          initial={false}
          animate={
            reduced
              ? {}
              : phase === "sealing"
                ? { scaleY: [1, 1.07, 1], opacity: [1, 1, 1] }
                : phase === "refused"
                  ? { scaleX: [1, 2.1, 1] }
                  : { scaleX: 1, scaleY: 1 }
          }
          transition={{ duration: phase === "sealing" ? 0.9 : 1.1, ease: "easeInOut" }}
          style={{ originY: 0.5, originX: 0.5 }}
        />
        <rect x={-4} y={0} width={8} height={3} rx={1.5} fill="var(--ink)" />
        <rect x={-4} y={H - 3} width={8} height={3} rx={1.5} fill="var(--ink)" />
      </motion.g>
    </svg>
  );
}
