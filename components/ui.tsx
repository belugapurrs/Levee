"use client";

import { useEffect } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type HTMLMotionProps,
  type SpringOptions,
} from "framer-motion";
import { formatEther } from "viem";

export const SPRING_NUM: SpringOptions = { stiffness: 160, damping: 24, mass: 1 };
export const SPRING_UI: SpringOptions = { stiffness: 210, damping: 26, mass: 1 };

export const screenMotion = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] as const },
};

export const pressable = {
  whileTap: { scale: 0.98 },
  transition: { duration: 0.1 },
};

// `useSpring` does not re-target when handed a plain number: its effect deps omit the
// source, and the underlying attach only subscribes to changes on a MotionValue. Routing
// the target through a MotionValue is what makes the spring actually follow new values.
export function useSpringNumber(target: number, options: SpringOptions = SPRING_NUM) {
  const raw = useMotionValue(target);
  useEffect(() => {
    raw.set(target);
  }, [raw, target]);
  return useSpring(raw, options);
}

/** Exact value, trailing zeros trimmed — for static amounts read off-chain. */
export function eth(wei: bigint) {
  return formatEther(wei);
}

export const toNumber = (wei: bigint) => Number(formatEther(wei));

/**
 * Decimal places are chosen from the target and then held fixed for the whole
 * animation, so a counting number never changes width mid-flight.
 */
export function decimalsFor(value: number) {
  const abs = Math.abs(value);
  if (abs === 0) return 5;
  if (abs >= 0.01) return 4;
  if (abs >= 0.001) return 5;
  if (abs >= 0.0001) return 6;
  return 8;
}

export function AnimatedEth({
  value,
  decimals,
  className,
}: {
  value: number;
  decimals?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const places = decimals ?? decimalsFor(value);
  const spring = useSpringNumber(value);
  const text = useTransform(spring, (v) => Math.max(0, v).toFixed(places));

  if (reduced) {
    return <span className={className}>{value.toFixed(places)}</span>;
  }
  return <motion.span className={className}>{text}</motion.span>;
}

export function Button({
  variant = "primary",
  children,
  ...rest
}: { variant?: "primary" | "secondary" | "danger" } & HTMLMotionProps<"button">) {
  const cls = variant === "secondary" ? "btn btn-secondary" : variant === "danger" ? "btn btn-danger" : "btn";
  return (
    <motion.button
      className={cls}
      whileTap={rest.disabled ? undefined : { scale: 0.98 }}
      transition={{ duration: 0.1 }}
      {...rest}
    >
      {children}
    </motion.button>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}
