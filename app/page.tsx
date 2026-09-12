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
import { screenTransition } from "@/components/motion";
import type { LeveePhase } from "@/components/LeveeVisual";
import { CommitScreen, HomeScreen, MoveScreen, RefuseScreen, type Commitment } from "@/components/screens";

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

// `new Date("2026-12-02")` parses date-only strings as UTC midnight, which lands on a
// different day/time locally. Build the date from parts so it is local midnight.
function dateInputToTimestamp(dateInput: string) {
  const [year, month, day] = dateInput.split("-").map(Number);
  return BigInt(Math.floor(new Date(year, month - 1, day).getTime() / 1000));
}

type View = "home" | "commit" | "deposit" | "spend" | "refused";

export default function Home() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();

  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");

  const [freeBalance, setFreeBalance] = useState<bigint | null>(null);
  const [commitments, setCommitments] = useState<Commitment[] | null>(null);
  const [readError, setReadError] = useState<string | null>(null);

  const [view, setView] = useState<View>("home");
  const [phase, setPhase] = useState<LeveePhase>("idle");
  const [pulseKey, setPulseKey] = useState(0);

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
  const [depositHash, setDepositHash] = useState<Hash | null>(null);
  const [depositError, setDepositError] = useState<string | null>(null);

  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault();
    if (!embeddedWallet) return;
    setDepositPending(true);
    setDepositHash(null);
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
      setDepositHash(hash);
      await refreshReads();
      setDepositAmount("");
      setView("home");
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
      setCommitAmount("");
      setCommitDate("");
      setCommitLabel("");
      setPulseKey((k) => k + 1);
      setPhase("sealing");
      setView("home");
      window.setTimeout(() => setPhase("idle"), 1400);
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
        setView("refused");
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
      setSpendAmount("");
      setView("home");
    } catch (err) {
      setSpendError(String(err));
    } finally {
      setSpendPending(false);
    }
  }

  if (!ready) {
    return (
      <div className="center">
        <span className="wordmark">Levee</span>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <motion.div className="center" {...screenTransition}>
        <span className="wordmark">Levee</span>
        <h1 className="display" style={{ maxWidth: "14ch" }}>
          Money that stays put.
        </h1>
        <p className="serif-note" style={{ maxWidth: "34ch" }}>
          Name an amount, name a date. It will not move until then — not for anyone, including you.
        </p>
        <div style={{ width: "min(22rem, 100%)", marginTop: "0.5rem" }}>
          <button className="btn" onClick={login}>
            Continue
          </button>
        </div>
      </motion.div>
    );
  }

  if (!embeddedWallet) {
    return (
      <div className="center">
        <span className="wordmark">Levee</span>
        <p className="serif-note">Setting up your wallet…</p>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {view === "home" && (
        <HomeScreen
          key="home"
          address={embeddedWallet.address}
          freeBalance={freeBalance}
          commitments={commitments}
          phase={phase}
          pulseKey={pulseKey}
          readError={readError}
          lastCommitHash={commitHash}
          onGoCommit={() => setView("commit")}
          onGoDeposit={() => setView("deposit")}
          onGoSpend={() => setView("spend")}
          onLogout={() => logout()}
        />
      )}

      {view === "commit" && (
        <CommitScreen
          key="commit"
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
          onBack={() => setView("home")}
        />
      )}

      {view === "deposit" && (
        <MoveScreen
          key="deposit"
          kind="deposit"
          amount={depositAmount}
          recipient=""
          pending={depositPending}
          error={depositError}
          hash={depositHash}
          freeBalance={freeBalance}
          onAmount={setDepositAmount}
          onRecipient={() => {}}
          onSubmit={handleDeposit}
          onBack={() => setView("home")}
        />
      )}

      {view === "spend" && (
        <MoveScreen
          key="spend"
          kind="spend"
          amount={spendAmount}
          recipient={spendTo}
          pending={spendPending}
          error={spendError}
          hash={spendHash}
          freeBalance={freeBalance}
          onAmount={setSpendAmount}
          onRecipient={setSpendTo}
          onSubmit={handleSpend}
          onBack={() => setView("home")}
        />
      )}

      {view === "refused" && spendBlock && (
        <RefuseScreen
          key="refused"
          requested={spendAmount}
          blockingLabel={spendBlock.label}
          blockingUnlockDate={spendBlock.unlockDate}
          freeBalance={freeBalance}
          heldTotal={(commitments ?? [])
            .filter((c) => !c.released)
            .reduce((sum, c) => sum + c.amount, 0n)}
          onAdjust={() => {
            setSpendAmount(freeBalance === null ? "" : formatEther(freeBalance));
            setView("spend");
          }}
          onBack={() => setView("home")}
        />
      )}
    </AnimatePresence>
  );
}
