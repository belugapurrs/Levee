"use client";

import { motion } from "framer-motion";
import { parseEther } from "viem";
import { ArrowLeft, CalendarDays, Check, Info, Lock, ScanLine, TriangleAlert } from "lucide-react";
import { AnimatedEth, Button, Field, decimalsFor, eth, screenMotion, toNumber } from "@/components/ui";
import { FlowChannel } from "@/components/FlowChannel";
import { dateInputToTimestamp, formatDate } from "@/lib/dates";

/** Preview-only parse. The transaction itself still parses in the handler. */
export function safeParseEth(value: string): bigint | null {
  const v = value.trim();
  if (!v) return null;
  try {
    return parseEther(v);
  } catch {
    return null;
  }
}

function BackBar({ onBack }: { onBack: () => void }) {
  return (
    <button className="back-btn" onClick={onBack}>
      <ArrowLeft size={18} /> Back
    </button>
  );
}

/* --------------------------------------------------------- hold money ---- */

export function HoldMoneyScreen({
  amount,
  date,
  label,
  pending,
  error,
  freeBalance,
  onAmount,
  onDate,
  onLabel,
  onSubmit,
  onBack,
}: {
  amount: string;
  date: string;
  label: string;
  pending: boolean;
  error: string | null;
  freeBalance: bigint | null;
  onAmount: (v: string) => void;
  onDate: (v: string) => void;
  onLabel: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
}) {
  const free = freeBalance ?? 0n;
  const parsed = safeParseEth(amount);
  const exceeds = parsed !== null && parsed > free;
  const after = parsed === null ? free : parsed > free ? 0n : free - parsed;
  const canSubmit = parsed !== null && parsed > 0n && !exceeds && date !== "" && !pending;

  // Smallest value drives precision, so no row in the preview collapses to 0.00000.
  const places = decimalsFor(Math.min(toNumber(free) || 1, toNumber(after) || 1));

  return (
    <motion.div className="page-narrow" {...screenMotion}>
      <BackBar onBack={onBack} />

      <h1 className="title">Hold money</h1>
      <p className="body" style={{ marginTop: 8, marginBottom: 32 }}>
        Set money aside for something you need later.
      </p>

      <form onSubmit={onSubmit} className="stack-24">
        <Field label="Amount">
          <div className="input-wrap">
            <input
              className={`input input-has-suffix${exceeds ? " input-error" : ""}`}
              type="text"
              inputMode="decimal"
              placeholder="0.008"
              value={amount}
              onChange={(e) => onAmount(e.target.value)}
            />
            <span className="input-suffix">ETH</span>
          </div>
          {exceeds && (
            <p className="body-sm" style={{ color: "var(--error)", marginTop: 8 }}>
              You only have {eth(free)} ETH free to hold.
            </p>
          )}
        </Field>

        <Field label="Release date">
          <div className="input-wrap">
            <input className="input" type="date" value={date} onChange={(e) => onDate(e.target.value)} />
            <span className="input-icon">
              <CalendarDays size={18} />
            </span>
          </div>
          {date !== "" && (
            <p className="body-sm" style={{ marginTop: 8 }}>
              Releases {formatDate(dateInputToTimestamp(date))}
            </p>
          )}
        </Field>

        <Field label="Purpose">
          <input
            className="input"
            type="text"
            placeholder="Birthday"
            value={label}
            onChange={(e) => onLabel(e.target.value)}
          />
        </Field>

        <div className="card-blue">
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", margin: 0 }}>After holding this</p>
          <div className="row-between" style={{ marginTop: 12, alignItems: "flex-end" }}>
            <div>
              <p className="body-sm" style={{ fontSize: 13 }}>
                Current safe to spend
              </p>
              <p className="num" style={{ marginTop: 4 }}>
                <AnimatedEth value={toNumber(free)} decimals={places} /> ETH
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p className="body-sm" style={{ fontSize: 13 }}>
                After hold
              </p>
              <p className="num num-blue" style={{ marginTop: 4 }}>
                <AnimatedEth value={toNumber(after)} decimals={places} /> ETH
              </p>
            </div>
          </div>
        </div>

        <Button type="submit" disabled={!canSubmit}>
          {pending ? (
            "Holding…"
          ) : (
            <>
              <Lock size={18} /> Hold {parsed !== null && !exceeds ? `${eth(parsed)} ETH` : "money"}
            </>
          )}
        </Button>
      </form>

      {error && (
        <p className="error-text" style={{ marginTop: 20 }}>
          {error}
        </p>
      )}
    </motion.div>
  );
}

/* --------------------------------------------------------------- spend ---- */

export function SpendScreen({
  amount,
  recipient,
  pending,
  error,
  freeBalance,
  heldTotal,
  onAmount,
  onRecipient,
  onSubmit,
  onBack,
}: {
  amount: string;
  recipient: string;
  pending: boolean;
  error: string | null;
  freeBalance: bigint | null;
  heldTotal: bigint;
  onAmount: (v: string) => void;
  onRecipient: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
}) {
  const free = freeBalance ?? 0n;
  const parsed = safeParseEth(amount);
  const exceeds = parsed !== null && parsed > free;
  const left = parsed === null ? free : exceeds ? 0n : free - parsed;
  const canSubmit = parsed !== null && parsed > 0n && recipient.trim() !== "" && !pending;

  // One precision for the whole summary so the three amounts line up as a column.
  const places = decimalsFor(
    Math.min(toNumber(free) || 1, toNumber(heldTotal) || 1, parsed ? toNumber(parsed) || 1 : 1),
  );

  return (
    <motion.div className="page-narrow" {...screenMotion}>
      <BackBar onBack={onBack} />

      <h1 className="title">Spend</h1>
      <p className="body" style={{ marginTop: 8, marginBottom: 24 }}>
        Only money that&apos;s free to spend can leave Levee.
      </p>

      <div className="card-blue" style={{ marginBottom: 32 }}>
        <p className="label-xs" style={{ color: "var(--blue-dark)" }}>
          Available to spend
        </p>
        <p style={{ fontSize: 28, fontWeight: 680, letterSpacing: "-1px", margin: "8px 0 0", fontVariantNumeric: "tabular-nums" }}>
          <AnimatedEth value={toNumber(free)} /> ETH
        </p>
        <p className="body-sm" style={{ marginTop: 6, fontSize: 13 }}>
          Held money cannot be spent.
        </p>
      </div>

      <form onSubmit={onSubmit} className="stack-24">
        <Field label="Amount">
          <div className="input-wrap">
            <input
              className={`input input-has-suffix${exceeds ? " input-error" : ""}`}
              type="text"
              inputMode="decimal"
              placeholder="0.001"
              value={amount}
              onChange={(e) => onAmount(e.target.value)}
            />
            <span className="input-suffix">ETH</span>
          </div>
        </Field>

        <Field label="Recipient">
          <div className="input-wrap">
            <input
              className="input"
              type="text"
              placeholder="0x…"
              style={{ paddingRight: 48, fontSize: 14 }}
              value={recipient}
              onChange={(e) => onRecipient(e.target.value)}
            />
            <span className="input-icon">
              <ScanLine size={18} />
            </span>
          </div>
        </Field>

        <div className="card">
          <div className="summary-row">
            <span className="body-sm">You&apos;ll send</span>
            <span className="num">
              <AnimatedEth value={parsed === null ? 0 : toNumber(parsed)} decimals={places} /> ETH
            </span>
          </div>
          <div className="summary-row">
            <span className="body-sm">You&apos;ll have left</span>
            <span className={`num${exceeds ? "" : " num-blue"}`} style={exceeds ? { color: "var(--error)" } : undefined}>
              <AnimatedEth value={toNumber(left)} decimals={places} /> ETH
            </span>
          </div>
          <div className="summary-row">
            <span className="body-sm">Still held</span>
            <span className="num">{toNumber(heldTotal).toFixed(places)} ETH</span>
          </div>
        </div>

        <Button type="submit" variant={exceeds ? "danger" : "primary"} disabled={!canSubmit}>
          {pending ? "Sending…" : parsed !== null ? `Send ${eth(parsed)} ETH` : "Send"}
        </Button>
      </form>

      {error && (
        <p className="error-text" style={{ marginTop: 20 }}>
          {error}
        </p>
      )}
    </motion.div>
  );
}

/* ----------------------------------------------------------- add money ---- */

export function AddMoneyScreen({
  amount,
  pending,
  error,
  onAmount,
  onSubmit,
  onBack,
}: {
  amount: string;
  pending: boolean;
  error: string | null;
  onAmount: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
}) {
  const parsed = safeParseEth(amount);
  const canSubmit = parsed !== null && parsed > 0n && !pending;

  return (
    <motion.div className="page-narrow" {...screenMotion}>
      <BackBar onBack={onBack} />

      <h1 className="title">Add money</h1>
      <p className="body" style={{ marginTop: 8, marginBottom: 32 }}>
        Bring money into your Levee wallet.
      </p>

      <form onSubmit={onSubmit} className="stack-24">
        <Field label="Amount">
          <div className="input-wrap">
            <input
              className="input input-has-suffix"
              type="text"
              inputMode="decimal"
              placeholder="0.010"
              value={amount}
              onChange={(e) => onAmount(e.target.value)}
            />
            <span className="input-suffix">ETH</span>
          </div>
        </Field>

        <div className="card-info">
          <Info size={18} style={{ flex: "none", marginTop: 1 }} />
          <span>Your available balance will increase after the deposit is confirmed.</span>
        </div>

        <Button type="submit" disabled={!canSubmit}>
          {pending ? "Adding…" : "Add money"}
        </Button>
      </form>

      {error && (
        <p className="error-text" style={{ marginTop: 20 }}>
          {error}
        </p>
      )}
    </motion.div>
  );
}

/* ------------------------------------------------------------- blocked ---- */

export function BlockedScreen({
  requested,
  freeBalance,
  heldTotal,
  onEdit,
  onViewHolds,
}: {
  requested: string;
  freeBalance: bigint | null;
  heldTotal: bigint;
  onEdit: () => void;
  onViewHolds: () => void;
}) {
  const free = freeBalance ?? 0n;
  const total = free + heldTotal;
  const ratio = total === 0n ? 0 : toNumber(free) / toNumber(total);

  return (
    <motion.div className="page-narrow" {...screenMotion}>
      <div style={{ marginTop: 8, marginBottom: 32 }}>
        <FlowChannel freeRatio={ratio} phase="blocked" hasMoney={total > 0n} />
      </div>

      <span className="icon-badge" style={{ background: "var(--error-bg)", color: "var(--error)" }}>
        <TriangleAlert size={18} />
      </span>

      <h1 className="title" style={{ marginTop: 16 }}>
        You can&apos;t spend that much yet.
      </h1>
      <p className="body" style={{ marginTop: 12 }}>
        {eth(heldTotal)} ETH is currently held for your upcoming commitments.
      </p>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="summary-row">
          <span className="body-sm">You asked for</span>
          <span className="num" style={{ color: "var(--error)" }}>
            {requested || "0"} ETH
          </span>
        </div>
        <div className="summary-row">
          <span className="body-sm">Safe to spend now</span>
          <span className="num num-blue">{eth(free)} ETH</span>
        </div>
        <div className="summary-row">
          <span className="body-sm">Held</span>
          <span className="num">{eth(heldTotal)} ETH</span>
        </div>
      </div>

      <div style={{ marginTop: 32 }} className="stack-16">
        <Button onClick={onEdit}>Edit amount</Button>
        <Button variant="secondary" onClick={onViewHolds}>
          View holds
        </Button>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------ successes ---- */

/** Particles flow into the container, then the boundary closes around them and holds. */
function ContainmentAnimation() {
  return (
    <div className="seal">
      <div className="seal-fill" />
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="seal-particle"
          style={{ top: 38 + i * 12, animationDelay: `${0.1 + i * 0.07}s` }}
        />
      ))}
      <div className="seal-frame" />
      <div className="seal-bar" />
    </div>
  );
}

export function HoldSuccessScreen({
  amount,
  unlockDate,
  hash,
  onHome,
}: {
  amount: string;
  unlockDate: string;
  hash: string | null;
  onHome: () => void;
}) {
  return (
    <motion.div className="page-narrow" {...screenMotion} style={{ textAlign: "center", paddingTop: 48 }}>
      <ContainmentAnimation />
      <h1 className="title" style={{ marginTop: 32 }}>
        Money held
      </h1>
      <p className="body" style={{ marginTop: 12 }}>
        {amount} ETH protected until {unlockDate}
      </p>
      <div style={{ marginTop: 32 }} className="stack-16">
        {hash && (
          <a
            className="btn-tertiary"
            href={`https://sepolia.etherscan.io/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
          >
            View transaction →
          </a>
        )}
        <Button onClick={onHome}>Back to home</Button>
      </div>
    </motion.div>
  );
}

export function SentScreen({
  amount,
  hash,
  onHome,
}: {
  amount: string;
  hash: string | null;
  onHome: () => void;
}) {
  return (
    <motion.div className="page-narrow" {...screenMotion} style={{ textAlign: "center", paddingTop: 64 }}>
      <motion.div
        className="success-icon"
        style={{ margin: "0 auto" }}
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        <Check size={28} strokeWidth={2.6} />
      </motion.div>
      <h1 className="title" style={{ marginTop: 24 }}>
        Sent
      </h1>
      <p className="body" style={{ marginTop: 12 }}>
        {amount} ETH sent successfully.
      </p>
      <div style={{ marginTop: 32 }} className="stack-16">
        {hash && (
          <a
            className="btn-tertiary"
            href={`https://sepolia.etherscan.io/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
          >
            View transaction →
          </a>
        )}
        <Button onClick={onHome}>Back to home</Button>
      </div>
    </motion.div>
  );
}
