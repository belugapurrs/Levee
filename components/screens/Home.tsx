"use client";

import { motion } from "framer-motion";
import {
  Activity as ActivityIcon,
  ArrowUpRight,
  ChevronRight,
  CreditCard,
  Gift,
  House,
  Lock,
  LockKeyhole,
  Plus,
  Settings as SettingsIcon,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { AnimatedEth, Button, eth, screenMotion, toNumber } from "@/components/ui";
import { FlowChannel, type FlowPhase } from "@/components/FlowChannel";
import { daysRemaining, formatDate } from "@/lib/dates";
import type { ActivityEvent } from "@/lib/activity";

export type Commitment = {
  amount: bigint;
  unlockDate: bigint;
  label: string;
  released: boolean;
};

export type Tab = "home" | "holds" | "activity" | "settings";

export function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4).toUpperCase()}`;
}

/** Icon is chosen from the label the user typed — never from invented categories. */
function holdIcon(label: string) {
  const l = label.toLowerCase();
  if (l.includes("rent") || l.includes("home") || l.includes("house")) return <House size={18} />;
  if (l.includes("birthday") || l.includes("gift")) return <Gift size={18} />;
  if (l.includes("loan") || l.includes("bill") || l.includes("emi") || l.includes("card"))
    return <CreditCard size={18} />;
  return <Wallet size={18} />;
}

export function TopBar({ address, onOpenWallet }: { address: string; onOpenWallet: () => void }) {
  return (
    <header className="row-between" style={{ marginBottom: 32 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "0.12em" }}>LEVEE</div>
        <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>Sepolia</div>
      </div>
      <button className="pill" onClick={onOpenWallet}>
        <span className="dot" />
        {shortAddress(address)}
      </button>
    </header>
  );
}

export function BottomNav({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const items: { id: Tab; label: string; Icon: typeof House }[] = [
    { id: "home", label: "Home", Icon: House },
    { id: "holds", label: "Holds", Icon: LockKeyhole },
    { id: "activity", label: "Activity", Icon: ActivityIcon },
    { id: "settings", label: "Settings", Icon: SettingsIcon },
  ];
  return (
    <nav className="bottom-nav">
      {items.map(({ id, label, Icon }) => (
        <button key={id} className="nav-item" data-active={String(tab === id)} onClick={() => onTab(id)}>
          <Icon size={20} strokeWidth={tab === id ? 2.4 : 2} />
          {label}
        </button>
      ))}
    </nav>
  );
}

function HoldRow({
  commitment,
  shareOfHeld,
  onClick,
}: {
  commitment: Commitment;
  shareOfHeld: number;
  onClick?: () => void;
}) {
  return (
    <button className="list-row" onClick={onClick} style={{ cursor: onClick ? "pointer" : "default" }}>
      <span className="icon-badge">{holdIcon(commitment.label)}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 15, fontWeight: 600, color: "var(--text)" }}>
          {commitment.label || "Untitled"}
        </span>
        <span style={{ display: "block", fontSize: 13, color: "var(--text-2)", marginTop: 2 }}>
          Releases {formatDate(commitment.unlockDate)}
        </span>
      </span>
      <span style={{ textAlign: "right", flex: "none" }}>
        <span className="num" style={{ display: "block" }}>
          {eth(commitment.amount)} ETH
        </span>
        <span
          style={{
            display: "block",
            width: 56,
            height: 4,
            borderRadius: 2,
            background: "var(--border)",
            marginTop: 6,
            marginLeft: "auto",
            overflow: "hidden",
          }}
        >
          <span
            style={{
              display: "block",
              height: "100%",
              width: `${Math.max(6, Math.min(100, shareOfHeld * 100))}%`,
              background: "var(--blue)",
              borderRadius: 2,
            }}
          />
        </span>
      </span>
    </button>
  );
}

export function HomeScreen({
  address,
  freeBalance,
  commitments,
  phase,
  readError,
  onHold,
  onSpend,
  onAdd,
  onViewAll,
  onOpenWallet,
}: {
  address: string;
  freeBalance: bigint | null;
  commitments: Commitment[] | null;
  phase: FlowPhase;
  readError: string | null;
  onHold: () => void;
  onSpend: () => void;
  onAdd: () => void;
  onViewAll: () => void;
  onOpenWallet: () => void;
}) {
  const open = (commitments ?? []).filter((c) => !c.released);
  const held = open.reduce((sum, c) => sum + c.amount, 0n);
  const free = freeBalance ?? 0n;
  const total = free + held;
  const ratio = total === 0n ? 1 : toNumber(free) / toNumber(total);

  const nextRelease =
    open.length === 0
      ? null
      : open.reduce((soonest, c) => (c.unlockDate < soonest.unlockDate ? c : soonest), open[0]);

  return (
    <motion.div className="page" {...screenMotion}>
      <TopBar address={address} onOpenWallet={onOpenWallet} />

      <div className="row-between" style={{ alignItems: "flex-start" }}>
        <div>
          <p className="label-xs">Safe to spend</p>
          <p className="hero" style={{ marginTop: 8 }}>
            {freeBalance === null ? "—" : <AnimatedEth value={toNumber(free)} />}
            <span style={{ fontSize: "0.42em", fontWeight: 600, letterSpacing: 0, marginLeft: 10 }}>ETH</span>
          </p>
          <p className="body-sm" style={{ marginTop: 8 }}>
            available right now
          </p>
        </div>
        {total > 0n && (
          <span className="badge" style={{ flex: "none", marginTop: 4 }}>
            <span className="dot" />
            {free > 0n ? "On track" : "All held"}
          </span>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <FlowChannel freeRatio={ratio} phase={phase} hasMoney={total > 0n} />
      </div>

      <div className="row-between" style={{ marginTop: 12 }}>
        <div>
          <div className="num num-blue">{eth(free)} ETH</div>
          <div className="body-sm" style={{ marginTop: 2 }}>
            Available
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="num">{eth(held)} ETH</div>
          <div className="body-sm" style={{ marginTop: 2 }}>
            Held
          </div>
        </div>
      </div>

      <section style={{ marginTop: 32 }}>
        <div className="row-between" style={{ marginBottom: 4 }}>
          <h2 className="section-heading">Your holds</h2>
          {open.length > 0 && (
            <button className="link-action" onClick={onViewAll}>
              View all <ChevronRight size={16} />
            </button>
          )}
        </div>

        {commitments === null && <p className="body-sm" style={{ padding: "16px 0" }}>Loading…</p>}

        {commitments !== null && open.length === 0 && (
          <div className="empty-state">
            <span className="icon-badge" style={{ margin: "0 auto 12px" }}>
              <Lock size={18} />
            </span>
            <p className="body-sm">Nothing is held yet. Every bit of your balance is free to spend.</p>
          </div>
        )}

        {open.slice(0, 3).map((c, i) => (
          <HoldRow key={i} commitment={c} shareOfHeld={held === 0n ? 0 : toNumber(c.amount) / toNumber(held)} />
        ))}
      </section>

      {nextRelease && (
        <section style={{ marginTop: 28 }}>
          <p className="label-xs" style={{ marginBottom: 10 }}>
            Next release
          </p>
          <div className="card" style={{ padding: 16 }}>
            <p style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{nextRelease.label || "Untitled"}</p>
            <p className="num" style={{ marginTop: 6 }}>
              {eth(nextRelease.amount)} ETH
            </p>
            <p className="body-sm" style={{ marginTop: 4 }}>
              Releases {formatDate(nextRelease.unlockDate)} · {daysRemaining(nextRelease.unlockDate)} days
            </p>
          </div>
        </section>
      )}

      {readError && (
        <p className="error-text" style={{ marginTop: 20 }}>
          {readError}
        </p>
      )}

      <div style={{ marginTop: 32 }} className="stack-16">
        <Button onClick={onHold}>
          <Lock size={18} /> Hold money
        </Button>
        <Button variant="secondary" onClick={onSpend}>
          <ArrowUpRight size={18} /> Spend
        </Button>
        <button className="btn-tertiary" onClick={onAdd}>
          <Plus size={16} /> Add money
        </button>
      </div>
    </motion.div>
  );
}

export function HoldsScreen({
  commitments,
  onBack,
  onHold,
  onSelect,
}: {
  commitments: Commitment[] | null;
  onBack: () => void;
  onHold: () => void;
  onSelect: (index: number) => void;
}) {
  const all = (commitments ?? []).map((c, i) => ({ c, i }));
  const open = all.filter(({ c }) => !c.released);
  const released = all.filter(({ c }) => c.released);
  const held = open.reduce((sum, { c }) => sum + c.amount, 0n);

  return (
    <motion.div className="page-narrow" {...screenMotion}>
      <h1 className="title" style={{ marginBottom: 8 }}>
        Your holds
      </h1>
      <p className="body" style={{ marginBottom: 24 }}>
        {open.length === 0
          ? "You have no money held right now."
          : `${eth(held)} ETH is held across ${open.length} ${open.length === 1 ? "hold" : "holds"}.`}
      </p>

      {open.map(({ c, i }) => (
        <HoldRow
          key={i}
          commitment={c}
          shareOfHeld={held === 0n ? 0 : toNumber(c.amount) / toNumber(held)}
          onClick={() => onSelect(i)}
        />
      ))}

      {released.length > 0 && (
        <>
          <p className="label-xs" style={{ marginTop: 32, marginBottom: 4 }}>
            Released
          </p>
          {released.map(({ c, i }) => (
            <button
              key={i}
              className="list-row"
              style={{ opacity: 0.6, cursor: "pointer" }}
              onClick={() => onSelect(i)}
            >
              <span className="icon-badge" style={{ background: "var(--success-bg)", color: "var(--success)" }}>
                <Lock size={18} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 15, fontWeight: 600 }}>{c.label || "Untitled"}</span>
                <span style={{ display: "block", fontSize: 13, color: "var(--text-2)", marginTop: 2 }}>
                  Released {formatDate(c.unlockDate)}
                </span>
              </span>
              <span className="num">{eth(c.amount)} ETH</span>
            </button>
          ))}
        </>
      )}

      <div style={{ marginTop: 32 }} className="stack-16">
        <Button onClick={onHold}>
          <Lock size={18} /> Hold money
        </Button>
        <Button variant="secondary" onClick={onBack}>
          Back to home
        </Button>
      </div>
    </motion.div>
  );
}

const ACTIVITY_META: Record<ActivityEvent["kind"], { title: string; icon: React.ReactNode }> = {
  added: { title: "Added money", icon: <Plus size={18} /> },
  held: { title: "Money held", icon: <Lock size={18} /> },
  sent: { title: "Money sent", icon: <ArrowUpRight size={18} /> },
  released: { title: "Money released", icon: <LockKeyhole size={18} /> },
  failed: { title: "Failed", icon: <TriangleAlert size={18} /> },
};

function formatEventDate(at: number) {
  return new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function ActivityScreen({ events }: { events: ActivityEvent[] }) {
  return (
    <motion.div className="page-narrow" {...screenMotion}>
      <h1 className="title" style={{ marginBottom: 8 }}>
        Activity
      </h1>
      <p className="body" style={{ marginBottom: 24 }}>
        Transactions sent from this device this session.
      </p>

      {events.length === 0 && (
        <div className="empty-state">
          <span className="icon-badge" style={{ margin: "0 auto 12px" }}>
            <ActivityIcon size={18} />
          </span>
          <p className="body-sm">No activity yet.</p>
        </div>
      )}

      {events.map((event) => {
        const meta = ACTIVITY_META[event.kind];
        const failed = event.status === "failed";
        return (
          <div key={event.id} className="list-row" style={{ alignItems: "flex-start" }}>
            <span
              className="icon-badge"
              style={failed ? { background: "var(--error-bg)", color: "var(--error)" } : undefined}
            >
              {meta.icon}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 15, fontWeight: 600 }}>
                {meta.title}
                {event.label ? ` · ${event.label}` : ""}
              </span>
              <span style={{ display: "block", fontSize: 13, color: "var(--text-2)", marginTop: 2 }}>
                {formatEventDate(event.at)}
              </span>
              {failed && event.errorMessage && (
                <span className="mono-note" style={{ display: "block", marginTop: 4 }}>
                  {event.errorMessage}
                </span>
              )}
              {event.hash && (
                <a
                  className="mono-note"
                  style={{ color: "var(--blue)", display: "block", marginTop: 4 }}
                  href={`https://sepolia.etherscan.io/tx/${event.hash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {event.hash}
                </a>
              )}
            </span>
            <span style={{ textAlign: "right", flex: "none" }}>
              <span className="num" style={{ display: "block", color: failed ? "var(--error)" : undefined }}>
                {event.amount} ETH
              </span>
              <span
                className="badge"
                style={{
                  marginTop: 6,
                  height: 20,
                  padding: "0 8px",
                  fontSize: 11,
                  ...(failed
                    ? { background: "var(--error-bg)", color: "var(--error)" }
                    : { background: "var(--success-bg)", color: "var(--success)" }),
                }}
              >
                {failed ? "Failed" : "Confirmed"}
              </span>
            </span>
          </div>
        );
      })}
    </motion.div>
  );
}

export function SettingsScreen({ address, onLogout }: { address: string; onLogout: () => void }) {
  return (
    <motion.div className="page-narrow" {...screenMotion}>
      <h1 className="title" style={{ marginBottom: 8 }}>
        Settings
      </h1>
      <p className="body" style={{ marginBottom: 24 }}>
        Your Levee wallet.
      </p>

      <div className="card stack-16">
        <div>
          <p className="label-xs">Wallet</p>
          <p className="mono-note" style={{ color: "var(--text)", marginTop: 6, fontSize: 13 }}>
            {address}
          </p>
        </div>
        <hr className="divider" />
        <div className="row-between">
          <span className="body-sm">Network</span>
          <span className="num" style={{ fontSize: 14 }}>
            Sepolia
          </span>
        </div>
        <hr className="divider" />
        <div className="row-between">
          <span className="body-sm">Recovery</span>
          <span className="body-sm">Managed by Privy</span>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <Button variant="secondary" onClick={onLogout}>
          Log out
        </Button>
      </div>
    </motion.div>
  );
}
