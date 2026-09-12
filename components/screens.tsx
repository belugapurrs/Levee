"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { formatEther } from "viem";
import { AnimatedAmount, screenTransition } from "@/components/motion";
import { LeveeVisual, type LeveePhase } from "@/components/LeveeVisual";

export type Commitment = {
  amount: bigint;
  unlockDate: bigint;
  label: string;
  released: boolean;
};

export function formatUnlockDate(unlockDate: bigint) {
  return new Date(Number(unlockDate) * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const toEth = (wei: bigint) => Number(formatEther(wei));

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <motion.main className="shell" {...screenTransition}>
      {children}
    </motion.main>
  );
}

/* ---------------------------------------------------------------- home ---- */

export function HomeScreen({
  address,
  freeBalance,
  commitments,
  phase,
  pulseKey,
  readError,
  lastCommitHash,
  onGoCommit,
  onGoDeposit,
  onGoSpend,
  onLogout,
}: {
  address: string;
  freeBalance: bigint | null;
  commitments: Commitment[] | null;
  phase: LeveePhase;
  pulseKey: number;
  readError: string | null;
  lastCommitHash: string | null;
  onGoCommit: () => void;
  onGoDeposit: () => void;
  onGoSpend: () => void;
  onLogout: () => void;
}) {
  const [showDebug, setShowDebug] = useState(false);

  const held = (commitments ?? [])
    .filter((c) => !c.released)
    .reduce((sum, c) => sum + c.amount, 0n);
  const free = freeBalance ?? 0n;
  const total = free + held;
  const freeRatio = total === 0n ? 1 : toEth(free) / toEth(total);
  const openCommitments = (commitments ?? []).filter((c) => !c.released);

  return (
    <Screen>
      <header className="topbar">
        <span className="wordmark">Levee</span>
        <button className="btn-quiet" onClick={onLogout}>
          {shortAddress(address)}
        </button>
      </header>

      <p className="eyebrow">Safe to spend</p>
      <p className="figure hero-figure" style={{ margin: "0.6rem 0 0" }}>
        {freeBalance === null ? "—" : <AnimatedAmount value={toEth(free)} />}
      </p>
      <p className="unit" style={{ margin: "0.75rem 0 0" }}>
        ETH · right now
      </p>

      <div style={{ margin: "2.75rem 0 1.1rem" }}>
        <LeveeVisual freeRatio={freeRatio} phase={phase} pulseKey={pulseKey} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2.75rem" }}>
        <span className="meta">{formatEther(free)} free</span>
        <span className="meta">{formatEther(held)} held</span>
      </div>

      <p className="serif-note" style={{ marginBottom: "3rem" }}>
        Your income may be unpredictable.
        <br />
        Your spending doesn&apos;t have to be.
      </p>

      {openCommitments.length > 0 && (
        <section style={{ marginBottom: "2.75rem" }}>
          <p className="eyebrow" style={{ marginBottom: "0.9rem" }}>
            Held until
          </p>
          <ul className="ledger">
            {openCommitments.map((c, i) => (
              <li className="ledger-row" key={i} data-released={String(c.released)}>
                <span className="ledger-label">{c.label}</span>
                <span className="ledger-amount">{formatEther(c.amount)} ETH</span>
                <span className="ledger-date">Until {formatUnlockDate(c.unlockDate)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {commitments !== null && openCommitments.length === 0 && (
        <p className="serif-note" style={{ marginBottom: "2.75rem" }}>
          Nothing is held yet. Everything you have is free to spend.
        </p>
      )}

      <button className="btn" onClick={onGoCommit}>
        Hold money for later
      </button>

      <div className="row-actions">
        <button className="btn-quiet" onClick={onGoDeposit}>
          Add money
        </button>
        <button className="btn-quiet" onClick={onGoSpend}>
          Spend
        </button>
      </div>

      {readError && <p className="notice">{readError}</p>}

      <button className="debug-toggle" onClick={() => setShowDebug((v) => !v)}>
        {showDebug ? "hide raw values" : "show raw values"}
      </button>

      {showDebug && (
        <div className="debug">
          <p className="debug">freeBalance: {freeBalance === null ? "null" : freeBalance.toString()}</p>
          <p className="debug">held: {held.toString()}</p>
          {lastCommitHash && <p className="debug">last commit tx: {lastCommitHash}</p>}
          {(commitments ?? []).map((c, i) => (
            <p className="debug" key={i}>
              [{i}] amount={c.amount.toString()} unlockDate={c.unlockDate.toString()} released={String(c.released)}{" "}
              label={c.label}
            </p>
          ))}
        </div>
      )}
    </Screen>
  );
}

/* -------------------------------------------------------------- commit ---- */

export function CommitScreen({
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
  return (
    <Screen>
      <header className="topbar">
        <button className="back" onClick={onBack}>
          ← Back
        </button>
      </header>

      <h1 className="display">Hold it back.</h1>
      <p className="serif-note" style={{ margin: "1.1rem 0 3rem" }}>
        Money you name and date. Nothing can release it early — not even you.
      </p>

      <form onSubmit={onSubmit}>
        <label className="field">
          <span className="eyebrow">How much</span>
          <input
            className="field-input"
            type="text"
            inputMode="decimal"
            placeholder="0.008"
            value={amount}
            onChange={(e) => onAmount(e.target.value)}
          />
        </label>

        <label className="field">
          <span className="eyebrow">Until</span>
          <input className="field-input" type="date" value={date} onChange={(e) => onDate(e.target.value)} />
        </label>

        <label className="field">
          <span className="eyebrow">What for</span>
          <input
            className="field-input"
            type="text"
            placeholder="rent"
            value={label}
            onChange={(e) => onLabel(e.target.value)}
          />
        </label>

        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Sealing…" : "Seal it"}
        </button>
      </form>

      <p className="meta" style={{ textAlign: "center", marginTop: "1.25rem" }}>
        {freeBalance === null ? "—" : `${formatEther(freeBalance)} ETH free to hold`}
      </p>

      {error && <p className="notice">{error}</p>}
    </Screen>
  );
}

/* -------------------------------------------------------------- refuse ---- */

export function RefuseScreen({
  requested,
  blockingLabel,
  blockingUnlockDate,
  freeBalance,
  heldTotal,
  onAdjust,
  onBack,
}: {
  requested: string;
  blockingLabel: string;
  blockingUnlockDate: bigint;
  freeBalance: bigint | null;
  heldTotal: bigint;
  onAdjust: () => void;
  onBack: () => void;
}) {
  const free = freeBalance ?? 0n;
  const total = free + heldTotal;
  const freeRatio = total === 0n ? 1 : toEth(free) / toEth(total);
  const unlockText = formatUnlockDate(blockingUnlockDate);

  return (
    <Screen>
      <header className="topbar">
        <button className="back" onClick={onBack}>
          ← Back
        </button>
      </header>

      <div style={{ margin: "0 0 2.75rem" }}>
        <LeveeVisual freeRatio={freeRatio} phase="refused" pulseKey={1} />
      </div>

      <h1 className="display">Not yet.</h1>

      <p className="serif-note" style={{ margin: "1.25rem 0 2.5rem" }}>
        You asked for {requested || "0"} ETH. That would reach into money you already promised
        to <em>{blockingLabel}</em>, held until {unlockText}.
      </p>

      <ul className="ledger" style={{ marginBottom: "2.5rem" }}>
        <li className="ledger-row">
          <span className="ledger-label">Safe to spend today</span>
          <span className="ledger-amount">{formatEther(free)} ETH</span>
        </li>
        <li className="ledger-row">
          <span className="ledger-label">{blockingLabel}</span>
          <span className="ledger-amount">unlocks {unlockText}</span>
        </li>
      </ul>

      <p className="meta" style={{ marginBottom: "2rem", lineHeight: 1.6 }}>
        Spend {formatEther(free)} ETH or less today, or release <em>{blockingLabel}</em> once{" "}
        {unlockText} arrives.
      </p>

      <button className="btn" onClick={onAdjust}>
        Spend {formatEther(free)} instead
      </button>

      <div className="row-actions">
        <button className="btn-quiet" onClick={onBack}>
          Back to home
        </button>
      </div>
    </Screen>
  );
}

/* ---------------------------------------------------- deposit and spend ---- */

export function MoveScreen({
  kind,
  amount,
  recipient,
  pending,
  error,
  hash,
  freeBalance,
  onAmount,
  onRecipient,
  onSubmit,
  onBack,
}: {
  kind: "deposit" | "spend";
  amount: string;
  recipient: string;
  pending: boolean;
  error: string | null;
  hash: string | null;
  freeBalance: bigint | null;
  onAmount: (v: string) => void;
  onRecipient: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
}) {
  const isDeposit = kind === "deposit";

  return (
    <Screen>
      <header className="topbar">
        <button className="back" onClick={onBack}>
          ← Back
        </button>
      </header>

      <h1 className="display">{isDeposit ? "Add money." : "Spend freely."}</h1>
      <p className="serif-note" style={{ margin: "1.1rem 0 3rem" }}>
        {isDeposit
          ? "Income arrives when it arrives. Put it somewhere it will wait for you."
          : "This only ever spends what is free. Held money stays held."}
      </p>

      <form onSubmit={onSubmit}>
        <label className="field">
          <span className="eyebrow">Amount</span>
          <input
            className="field-input"
            type="text"
            inputMode="decimal"
            placeholder="0.010"
            value={amount}
            onChange={(e) => onAmount(e.target.value)}
          />
        </label>

        {!isDeposit && (
          <label className="field">
            <span className="eyebrow">To</span>
            <input
              className="field-input"
              type="text"
              placeholder="0x…"
              style={{ fontSize: "1.05rem" }}
              value={recipient}
              onChange={(e) => onRecipient(e.target.value)}
            />
          </label>
        )}

        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Sending…" : isDeposit ? "Add money" : "Send it"}
        </button>
      </form>

      <p className="meta" style={{ textAlign: "center", marginTop: "1.25rem" }}>
        {freeBalance === null ? "—" : `${formatEther(freeBalance)} ETH free`}
      </p>

      {hash && <p className="notice">Confirmed · {hash}</p>}
      {error && <p className="notice">{error}</p>}
    </Screen>
  );
}
