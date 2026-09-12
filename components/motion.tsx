"use client";

import { useEffect } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type SpringOptions,
} from "framer-motion";

export const SPRING_SOFT: SpringOptions = { stiffness: 120, damping: 26, mass: 1 };
export const SPRING_FIGURE: SpringOptions = { stiffness: 90, damping: 24, mass: 1 };
export const SPRING_SEAL: SpringOptions = { stiffness: 140, damping: 30, mass: 1 };

export const screenTransition = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { type: "spring", ...SPRING_SOFT } as const,
};

// `useSpring` does not re-target when handed a plain number: its effect deps omit the
// source, and the underlying attach only subscribes to changes on a MotionValue. Routing
// the target through a MotionValue is what makes the spring actually follow new values.
export function useSpringNumber(target: number, options: SpringOptions = SPRING_SOFT) {
  const raw = useMotionValue(target);
  useEffect(() => {
    raw.set(target);
  }, [raw, target]);
  return useSpring(raw, options);
}

export function AnimatedAmount({
  value,
  decimals = 4,
  className,
}: {
  value: number;
  decimals?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const spring = useSpringNumber(value, SPRING_FIGURE);
  const text = useTransform(spring, (v) => v.toFixed(decimals));

  if (reduced) {
    return <span className={className}>{value.toFixed(decimals)}</span>;
  }
  return <motion.span className={className}>{text}</motion.span>;
}
