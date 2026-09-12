"use client";

import { useCallback, useEffect, useState } from "react";
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
import { Button, screenMotion } from "@/components/ui";
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
  HoldMoneyScreen,
  HoldSuccessScreen,
  SentScreen,
  SpendScreen,
} from "@/components/screens/Flows";

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

type Overlay = null | "hold" | "spend" | "add" | "blocked" | "holdDone" | "sent";

export default function Home() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();

  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");

  const [freeBalance, setFreeBalance] = useState<bigint | null>(null);
  const [commitments, setCommitments] = useState<Commitment[] | null>(null);
  const [readError, setReadError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("home");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [flowPhase, setFlowPhase] = useState<FlowPhase>("idle");
  const [sessionTx, setSessionTx] = useState<{ kind: string; hash: string }[]>([]);
  const [lastHold, setLastHold] = useState({ amount: "", date: "" });
  const [lastSpend, setLastSpend] = useState("");

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
  }, [embeddedWallet]);

  // deposit()
  const [depositAmount, setDepositAmount] = useState("");
  const [depositPending, setDepositPending] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);

  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault();
    if (!embeddedWallet) return;
    setDepositPending(true);
    setDepositError(null);
    try {
      const walletClient = await getWalletClient(embeddedWallet);
      const hash = await walletClient.writeContract({
        address: LEVEE_ADDRESS as Address,
        abi: LEVEE_ABI,
        functionName: "deposit",
        value: parseEther(depositAmount),
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await refreshReads();
      setSessionTx((t) => [{ kind: "added money", hash }, ...t]);
      setDepositAmount("");
      setOverlay(null);
      setTab("home");
      setFlowPhase("idle");
    } catch (err) {
      setDepositError(String(err));
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
    try {
      const walletClient = await getWalletClient(embeddedWallet);
      const hash = await walletClient.writeContract({
        address: LEVEE_ADDRESS as Address,
        abi: LEVEE_ABI,
        functionName: "commit",
        args: [parseEther(commitAmount), dateInputToTimestamp(commitDate), commitLabel],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setCommitHash(hash);
      await refreshReads();
      setSessionTx((t) => [{ kind: "held money", hash }, ...t]);
      setLastHold({
        amount: formatEther(parseEther(commitAmount)),
        date: formatDate(dateInputToTimestamp(commitDate)),
      });
      setCommitAmount("");
      setCommitDate("");
      setCommitLabel("");
      setFlowPhase("holding");
      setOverlay("holdDone");
      window.setTimeout(() => setFlowPhase("idle"), 1200);
    } catch (err) {
      setCommitError(String(err));
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
    try {
      const amountWei = parseEther(spendAmount);
      const [allowed, , label, unlockDate] = (await publicClient.readContract({
        address: LEVEE_ADDRESS as Address,
        abi: LEVEE_ABI,
        functionName: "canSpend",
        args: [embeddedWallet.address as Address, amountWei],
      })) as readonly [boolean, bigint, string, bigint];

      if (!allowed) {
        setSpendBlock({ label, unlockDate });
        setFlowPhase("blocked");
        setOverlay("blocked");
        return;
      }

      const walletClient = await getWalletClient(embeddedWallet);
      const hash = await walletClient.writeContract({
        address: LEVEE_ADDRESS as Address,
        abi: LEVEE_ABI,
        functionName: "spendFree",
        args: [amountWei, spendTo as Address],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setSpendHash(hash);
      await refreshReads();
      setSessionTx((t) => [{ kind: "sent", hash }, ...t]);
      setLastSpend(formatEther(amountWei));
      setSpendAmount("");
      setFlowPhase("spending");
      setOverlay("sent");
      window.setTimeout(() => setFlowPhase("idle"), 1200);
    } catch (err) {
      setSpendError(String(err));
    } finally {
      setSpendPending(false);
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
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "0.12em", marginBottom: 8 }}>LEVEE</div>
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
          />
        )}

        {overlay === null && tab === "activity" && (
          <ActivityScreen key="activity" commitments={commitments} sessionTx={sessionTx} />
        )}

        {overlay === null && tab === "settings" && (
          <SettingsScreen key="settings" address={address} onLogout={() => logout()} />
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

      {overlay === null && <BottomNav tab={tab} onTab={setTab} />}
    </>
  );
}
