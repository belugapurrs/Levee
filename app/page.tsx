"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePrivy, useWallets, type ConnectedWallet } from "@privy-io/react-auth";
import { AnimatePresence, motion } from "framer-motion";
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatEther,
  http,
  parseEther,
  type Address,
  type Hash,
} from "viem";
import { sepolia } from "viem/chains";
import { LEVEE_ADDRESS, LEVEE_ABI } from "@/lib/leveeAbi";
import { dateInputToTimestamp, formatDate } from "@/lib/dates";
import type { ActivityEvent } from "@/lib/activity";
import { Button, eth, screenMotion } from "@/components/ui";
import type { FlowPhase } from "@/components/FlowChannel";
import {
  ActivityScreen,
  BottomNav,
  HoldsScreen,
  HomeScreen,
  SettingsScreen,
  type Commitment,
  type Tab,
} from "@/components/screens/Home";
import {
  AddMoneyScreen,
  BlockedScreen,
  HoldDetailScreen,
  HoldMoneyScreen,
  HoldSuccessScreen,
  SentScreen,
  SpendScreen,
} from "@/components/screens/Flows";
import { ChatPanel } from "@/components/ChatPanel";

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(),
});

async function getWalletClient(wallet: ConnectedWallet) {
  await wallet.switchChain(sepolia.id);
  const provider = await wallet.getEthereumProvider();
  return createWalletClient({
    account: wallet.address as Address,
    chain: sepolia,
    transport: custom(provider),
  });
}

/**
 * `waitForTransactionReceipt` resolves once a transaction is mined regardless of
 * whether it succeeded or reverted on-chain — it does not throw on revert. Every
 * write in this app must check `status` itself, or a reverted transaction (e.g. a
 * race against another commit) would be reported to the user as a success.
 */
async function assertMined(hash: Hash) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status === "reverted") {
    throw new Error("Transaction reverted on-chain.");
  }
}

type Overlay = null | "hold" | "spend" | "add" | "blocked" | "holdDone" | "sent" | "holdDetail";

export default function Home() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();

  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");

  const [freeBalance, setFreeBalance] = useState<bigint | null>(null);
  const [commitments, setCommitments] = useState<Commitment[] | null>(null);
  const [walletBalance, setWalletBalance] = useState<bigint | null>(null);
  const [readError, setReadError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("home");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [flowPhase, setFlowPhase] = useState<FlowPhase>("idle");
  const [lastHold, setLastHold] = useState({ amount: "", date: "" });
  const [lastSpend, setLastSpend] = useState("");
  const [selectedHoldIndex, setSelectedHoldIndex] = useState<number | null>(null);
  const [commitTxByIndex, setCommitTxByIndex] = useState<Record<number, Hash>>({});

  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const activityIdRef = useRef(0);
  const pushActivity = useCallback((event: Omit<ActivityEvent, "id" | "at">) => {
    activityIdRef.current += 1;
    setActivity((prev) => [{ ...event, id: `evt-${activityIdRef.current}`, at: Date.now() }, ...prev]);
  }, []);

  const heldTotal = (commitments ?? [])
    .filter((c) => !c.released)
    .reduce((sum, c) => sum + c.amount, 0n);

  const refreshReads = useCallback(async () => {
    if (!embeddedWallet) return;
    const address = embeddedWallet.address as Address;

    try {
      const result = await publicClient.readContract({
        address: LEVEE_ADDRESS as Address,
        abi: LEVEE_ABI,
        functionName: "freeBalance",
        args: [address],
      });
      setFreeBalance(result);
    } catch (err) {
      setReadError(`freeBalance read failed: ${String(err)}`);
    }

    try {
      const result = await publicClient.readContract({
        address: LEVEE_ADDRESS as Address,
        abi: LEVEE_ABI,
        functionName: "commitmentsOf",
        args: [address],
      });
      setCommitments(result as unknown as Commitment[]);
    } catch (err) {
      setReadError(`commitmentsOf read failed: ${String(err)}`);
    }

    try {
      const result = await publicClient.getBalance({ address });
      setWalletBalance(result);
    } catch (err) {
      setReadError(`wallet balance read failed: ${String(err)}`);
    }
  }, [embeddedWallet]);

  useEffect(() => {
    if (!embeddedWallet) return;
    const address = embeddedWallet.address as Address;

    publicClient
      .readContract({
        address: LEVEE_ADDRESS as Address,
        abi: LEVEE_ABI,
        functionName: "freeBalance",
        args: [address],
      })
      .then((result) => setFreeBalance(result))
      .catch((err) => setReadError(`freeBalance read failed: ${String(err)}`));

    publicClient
      .readContract({
        address: LEVEE_ADDRESS as Address,
        abi: LEVEE_ABI,
        functionName: "commitmentsOf",
        args: [address],
      })
      .then((result) => setCommitments(result as unknown as Commitment[]))
      .catch((err) => setReadError(`commitmentsOf read failed: ${String(err)}`));

    publicClient
      .getBalance({ address })
      .then((result) => setWalletBalance(result))
      .catch((err) => setReadError(`wallet balance read failed: ${String(err)}`));
  }, [embeddedWallet]);

  function flashPhase(phase: FlowPhase) {
    setFlowPhase(phase);
    window.setTimeout(() => setFlowPhase("idle"), 1200);
  }

  // deposit()
  const [depositAmount, setDepositAmount] = useState("");
  const [depositPending, setDepositPending] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);

  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault();
    if (!embeddedWallet) return;
    setDepositPending(true);
    setDepositError(null);
    const amountLabel = depositAmount;
    let hash: Hash | null = null;
    try {
      const walletClient = await getWalletClient(embeddedWallet);
      hash = await walletClient.writeContract({
        address: LEVEE_ADDRESS as Address,
        abi: LEVEE_ABI,
        functionName: "deposit",
        value: parseEther(amountLabel),
      });
      await assertMined(hash);
      await refreshReads();
      pushActivity({ kind: "added", action: "add", amount: amountLabel, hash, status: "confirmed" });
      setDepositAmount("");
      setOverlay(null);
      setTab("home");
      flashPhase("adding");
    } catch (err) {
      setDepositError(String(err));
      pushActivity({
        kind: "failed",
        action: "add",
        amount: amountLabel,
        hash,
        status: "failed",
        errorMessage: String(err),
      });
      if (hash) await refreshReads();
    } finally {
      setDepositPending(false);
    }
  }

  // commit(amount, unlockDate, label)
  const [commitAmount, setCommitAmount] = useState("");
  const [commitDate, setCommitDate] = useState("");
  const [commitLabel, setCommitLabel] = useState("");
  const [commitPending, setCommitPending] = useState(false);
  const [commitHash, setCommitHash] = useState<Hash | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);

  async function handleCommit(e: React.FormEvent) {
    e.preventDefault();
    if (!embeddedWallet) return;
    setCommitPending(true);
    setCommitHash(null);
    setCommitError(null);
    const amountLabel = commitAmount;
    const labelText = commitLabel;
    const unlockTs = dateInputToTimestamp(commitDate);
    let hash: Hash | null = null;
    try {
      const walletClient = await getWalletClient(embeddedWallet);
      hash = await walletClient.writeContract({
        address: LEVEE_ADDRESS as Address,
        abi: LEVEE_ABI,
        functionName: "commit",
        args: [parseEther(amountLabel), unlockTs, labelText],
      });
      await assertMined(hash);
      setCommitHash(hash);

      const freshCommitments = (await publicClient.readContract({
        address: LEVEE_ADDRESS as Address,
        abi: LEVEE_ABI,
        functionName: "commitmentsOf",
        args: [embeddedWallet.address as Address],
      })) as unknown as Commitment[];
      const newIndex = freshCommitments.length - 1;
      setCommitments(freshCommitments);
      setCommitTxByIndex((prev) => ({ ...prev, [newIndex]: hash as Hash }));
      await refreshReads();

      pushActivity({
        kind: "held",
        action: "hold",
        amount: amountLabel,
        label: labelText,
        hash,
        status: "confirmed",
      });
      setLastHold({ amount: formatEther(parseEther(amountLabel)), date: formatDate(unlockTs) });
      setCommitAmount("");
      setCommitDate("");
      setCommitLabel("");
      setOverlay("holdDone");
      flashPhase("holding");
    } catch (err) {
      setCommitError(String(err));
      pushActivity({
        kind: "failed",
        action: "hold",
        amount: amountLabel,
        label: labelText,
        hash,
        status: "failed",
        errorMessage: String(err),
      });
      if (hash) await refreshReads();
    } finally {
      setCommitPending(false);
    }
  }

  // spendFree(amount, to), gated by canSpend(address, amount)
  const [spendAmount, setSpendAmount] = useState("");
  const [spendTo, setSpendTo] = useState("");
  const [spendPending, setSpendPending] = useState(false);
  const [spendHash, setSpendHash] = useState<Hash | null>(null);
  const [spendError, setSpendError] = useState<string | null>(null);
  const [spendBlock, setSpendBlock] = useState<{ label: string; unlockDate: bigint } | null>(null);

  async function handleSpend(e: React.FormEvent) {
    e.preventDefault();
    if (!embeddedWallet) return;
    setSpendPending(true);
    setSpendHash(null);
    setSpendError(null);
    setSpendBlock(null);
    const amountLabel = spendAmount;
    let hash: Hash | null = null;
    try {
      const amountWei = parseEther(amountLabel);
      const [allowed, , label, unlockDate] = (await publicClient.readContract({
        address: LEVEE_ADDRESS as Address,
        abi: LEVEE_ABI,
        functionName: "canSpend",
        args: [embeddedWallet.address as Address, amountWei],
      })) as readonly [boolean, bigint, string, bigint];

      if (!allowed) {
        setSpendBlock({ label, unlockDate });
        setOverlay("blocked");
        setFlowPhase("blocked");
        return;
      }

      const walletClient = await getWalletClient(embeddedWallet);
      hash = await walletClient.writeContract({
        address: LEVEE_ADDRESS as Address,
        abi: LEVEE_ABI,
        functionName: "spendFree",
        args: [amountWei, spendTo as Address],
      });
      await assertMined(hash);
      setSpendHash(hash);
      await refreshReads();
      pushActivity({ kind: "sent", action: "spend", amount: amountLabel, hash, status: "confirmed" });
      setLastSpend(formatEther(amountWei));
      setSpendAmount("");
      setOverlay("sent");
      flashPhase("spending");
    } catch (err) {
      setSpendError(String(err));
      pushActivity({
        kind: "failed",
        action: "spend",
        amount: amountLabel,
        hash,
        status: "failed",
        errorMessage: String(err),
      });
      if (hash) await refreshReads();
    } finally {
      setSpendPending(false);
    }
  }

  // release(commitmentId)
  const [releasePending, setReleasePending] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);

  async function handleRelease(index: number) {
    if (!embeddedWallet) return;
    const commitment = commitments?.[index];
    if (!commitment) return;
    setReleasePending(true);
    setReleaseError(null);
    let hash: Hash | null = null;
    try {
      const walletClient = await getWalletClient(embeddedWallet);
      hash = await walletClient.writeContract({
        address: LEVEE_ADDRESS as Address,
        abi: LEVEE_ABI,
        functionName: "release",
        args: [BigInt(index)],
      });
      await assertMined(hash);
      await refreshReads();
      pushActivity({
        kind: "released",
        action: "release",
        amount: eth(commitment.amount),
        label: commitment.label,
        hash,
        status: "confirmed",
      });
      setOverlay(null);
      flashPhase("releasing");
    } catch (err) {
      setReleaseError(String(err));
      pushActivity({
        kind: "failed",
        action: "release",
        amount: eth(commitment.amount),
        label: commitment.label,
        hash,
        status: "failed",
        errorMessage: String(err),
      });
      if (hash) await refreshReads();
    } finally {
      setReleasePending(false);
    }
  }

  if (!ready) {
    return (
      <div className="center-state">
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "0.12em" }}>LEVEE</div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <motion.div className="center-state" {...screenMotion}>
        <Image
          src="/logo_levee.png"
          alt="Levee"
          width={120}
          height={120}
          priority
          style={{ marginBottom: 8 }}
        />
        <h1 className="title" style={{ maxWidth: 320 }}>
          Know what&apos;s safe to spend
        </h1>
        <p className="body" style={{ maxWidth: 340 }}>
          Set money aside for what&apos;s coming. Levee keeps it out of reach until the date you choose.
        </p>
        <div style={{ width: "min(340px, 100%)", marginTop: 16 }}>
          <Button onClick={login}>Get started</Button>
        </div>
      </motion.div>
    );
  }

  if (!embeddedWallet) {
    return (
      <div className="center-state">
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "0.12em" }}>LEVEE</div>
        <p className="body">Setting up your wallet…</p>
      </div>
    );
  }

  const address = embeddedWallet.address;
  const selectedHold = selectedHoldIndex !== null ? commitments?.[selectedHoldIndex] ?? null : null;

  return (
    <>
      <AnimatePresence mode="wait">
        {overlay === null && tab === "home" && (
          <HomeScreen
            key="home"
            address={address}
            freeBalance={freeBalance}
            commitments={commitments}
            phase={flowPhase}
            readError={readError}
            onHold={() => setOverlay("hold")}
            onSpend={() => setOverlay("spend")}
            onAdd={() => setOverlay("add")}
            onViewAll={() => setTab("holds")}
            onOpenWallet={() => setTab("settings")}
          />
        )}

        {overlay === null && tab === "holds" && (
          <HoldsScreen
            key="holds"
            commitments={commitments}
            onBack={() => setTab("home")}
            onHold={() => setOverlay("hold")}
            onSelect={(index) => {
              setSelectedHoldIndex(index);
              setReleaseError(null);
              setOverlay("holdDetail");
            }}
          />
        )}

        {overlay === null && tab === "activity" && <ActivityScreen key="activity" events={activity} />}

        {overlay === null && tab === "settings" && (
          <SettingsScreen key="settings" address={address} onLogout={() => logout()} />
        )}

        {overlay === "holdDetail" && selectedHold && selectedHoldIndex !== null && (
          <HoldDetailScreen
            key="holdDetail"
            commitment={selectedHold}
            hash={commitTxByIndex[selectedHoldIndex] ?? null}
            pending={releasePending}
            error={releaseError}
            onRelease={() => handleRelease(selectedHoldIndex)}
            onBack={() => setOverlay(null)}
          />
        )}

        {overlay === "hold" && (
          <HoldMoneyScreen
            key="hold"
            amount={commitAmount}
            date={commitDate}
            label={commitLabel}
            pending={commitPending}
            error={commitError}
            freeBalance={freeBalance}
            onAmount={setCommitAmount}
            onDate={setCommitDate}
            onLabel={setCommitLabel}
            onSubmit={handleCommit}
            onBack={() => setOverlay(null)}
          />
        )}

        {overlay === "spend" && (
          <SpendScreen
            key="spend"
            amount={spendAmount}
            recipient={spendTo}
            pending={spendPending}
            error={spendError}
            freeBalance={freeBalance}
            heldTotal={heldTotal}
            onAmount={setSpendAmount}
            onRecipient={setSpendTo}
            onSubmit={handleSpend}
            onBack={() => setOverlay(null)}
          />
        )}

        {overlay === "add" && (
          <AddMoneyScreen
            key="add"
            amount={depositAmount}
            pending={depositPending}
            error={depositError}
            walletBalance={walletBalance}
            freeBalance={freeBalance}
            heldTotal={heldTotal}
            onAmount={setDepositAmount}
            onSubmit={handleDeposit}
            onBack={() => setOverlay(null)}
          />
        )}

        {overlay === "blocked" && spendBlock && (
          <BlockedScreen
            key="blocked"
            requested={spendAmount}
            freeBalance={freeBalance}
            heldTotal={heldTotal}
            onEdit={() => {
              setFlowPhase("idle");
              setOverlay("spend");
            }}
            onViewHolds={() => {
              setFlowPhase("idle");
              setOverlay(null);
              setTab("holds");
            }}
          />
        )}

        {overlay === "holdDone" && (
          <HoldSuccessScreen
            key="holdDone"
            amount={lastHold.amount}
            unlockDate={lastHold.date}
            hash={commitHash}
            onHome={() => {
              setOverlay(null);
              setTab("home");
            }}
          />
        )}

        {overlay === "sent" && (
          <SentScreen
            key="sent"
            amount={lastSpend}
            hash={spendHash}
            onHome={() => {
              setOverlay(null);
              setTab("home");
            }}
          />
        )}
      </AnimatePresence>

      {overlay === null && <ChatPanel />}
      {overlay === null && <BottomNav tab={tab} onTab={setTab} />}
    </>
  );
}
