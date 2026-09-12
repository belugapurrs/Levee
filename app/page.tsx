"use client";

import { useCallback, useEffect, useState } from "react";
import { usePrivy, useWallets, type ConnectedWallet } from "@privy-io/react-auth";
import { createPublicClient, createWalletClient, custom, http, parseEther, type Address, type Hash } from "viem";
import { sepolia } from "viem/chains";
import { LEVEE_ADDRESS, LEVEE_ABI } from "@/lib/leveeAbi";

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

function stringifyWithBigInt(value: unknown) {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));
}

export default function Home() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();

  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");

  const [freeBalance, setFreeBalance] = useState<string | null>(null);
  const [commitments, setCommitments] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);

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
      setFreeBalance(stringifyWithBigInt(result));
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
      setCommitments(stringifyWithBigInt(result));
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
      .then((result) => setFreeBalance(stringifyWithBigInt(result)))
      .catch((err) => setReadError(`freeBalance read failed: ${String(err)}`));

    publicClient
      .readContract({
        address: LEVEE_ADDRESS as Address,
        abi: LEVEE_ABI,
        functionName: "commitmentsOf",
        args: [address],
      })
      .then((result) => setCommitments(stringifyWithBigInt(result)))
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
      const unlockTimestamp = BigInt(Math.floor(new Date(commitDate).getTime() / 1000));
      const walletClient = await getWalletClient(embeddedWallet);
      const hash = await walletClient.writeContract({
        address: LEVEE_ADDRESS as Address,
        abi: LEVEE_ABI,
        functionName: "commit",
        args: [parseEther(commitAmount), unlockTimestamp, commitLabel],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setCommitHash(hash);
      await refreshReads();
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
  const [spendBlock, setSpendBlock] = useState<{ label: string; unlockDate: string } | null>(null);

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
        setSpendBlock({ label, unlockDate: unlockDate.toString() });
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
    } catch (err) {
      setSpendError(String(err));
    } finally {
      setSpendPending(false);
    }
  }

  if (!ready) {
    return <p>loading...</p>;
  }

  if (!authenticated) {
    return <button onClick={login}>Log in</button>;
  }

  return (
    <div>
      <p>wallet address: {embeddedWallet ? embeddedWallet.address : "no embedded wallet found"}</p>
      <button onClick={() => logout()}>Log out</button>
      <p>freeBalance: {freeBalance ?? "loading..."}</p>
      <p>commitmentsOf: {commitments ?? "loading..."}</p>
      {readError && <p>error: {readError}</p>}

      <hr />

      <form onSubmit={handleDeposit}>
        <p>deposit</p>
        <input
          type="text"
          placeholder="amount in ETH"
          value={depositAmount}
          onChange={(e) => setDepositAmount(e.target.value)}
        />
        <button type="submit" disabled={depositPending}>
          {depositPending ? "sending..." : "deposit"}
        </button>
        {depositHash && <p>hash: {depositHash}</p>}
        {depositError && <p>error: {depositError}</p>}
      </form>

      <hr />

      <form onSubmit={handleCommit}>
        <p>commit</p>
        <input
          type="text"
          placeholder="amount in ETH"
          value={commitAmount}
          onChange={(e) => setCommitAmount(e.target.value)}
        />
        <input type="date" value={commitDate} onChange={(e) => setCommitDate(e.target.value)} />
        <input
          type="text"
          placeholder="label"
          value={commitLabel}
          onChange={(e) => setCommitLabel(e.target.value)}
        />
        <button type="submit" disabled={commitPending}>
          {commitPending ? "sending..." : "commit"}
        </button>
        {commitHash && <p>hash: {commitHash}</p>}
        {commitError && <p>error: {commitError}</p>}
      </form>

      <hr />

      <form onSubmit={handleSpend}>
        <p>spendFree</p>
        <input
          type="text"
          placeholder="amount in ETH"
          value={spendAmount}
          onChange={(e) => setSpendAmount(e.target.value)}
        />
        <input type="text" placeholder="to address" value={spendTo} onChange={(e) => setSpendTo(e.target.value)} />
        <button type="submit" disabled={spendPending}>
          {spendPending ? "sending..." : "spendFree"}
        </button>
        {spendBlock && (
          <p>
            blocked by commitment &quot;{spendBlock.label}&quot;, unlocks at {spendBlock.unlockDate}
          </p>
        )}
        {spendHash && <p>hash: {spendHash}</p>}
        {spendError && <p>error: {spendError}</p>}
      </form>
    </div>
  );
}
