"use client";

import { useEffect, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createPublicClient, http, type Address } from "viem";
import { sepolia } from "viem/chains";
import { LEVEE_ADDRESS, LEVEE_ABI } from "@/lib/leveeAbi";

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(),
});

function stringifyWithBigInt(value: unknown) {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));
}

export default function Home() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();

  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");

  const [freeBalance, setFreeBalance] = useState<string | null>(null);
  const [commitments, setCommitments] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      .catch((err) => setError(`freeBalance read failed: ${String(err)}`));

    publicClient
      .readContract({
        address: LEVEE_ADDRESS as Address,
        abi: LEVEE_ABI,
        functionName: "commitmentsOf",
        args: [address],
      })
      .then((result) => setCommitments(stringifyWithBigInt(result)))
      .catch((err) => setError(`commitmentsOf read failed: ${String(err)}`));
  }, [embeddedWallet]);

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
      {error && <p>error: {error}</p>}
    </div>
  );
}
