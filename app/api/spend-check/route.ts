import { createPublicClient, formatEther, http, isAddress, parseEther, type Address } from "viem";
import { sepolia } from "viem/chains";
import { type NextRequest } from "next/server";
import { LEVEE_ABI, LEVEE_ADDRESS } from "@/lib/leveeAbi";
import { formatDate } from "@/lib/dates";

const SUBGRAPH_URL = "https://api.studio.thegraph.com/query/1760220/levee-sepolia/v0.0.1";

const OBLIGATIONS_QUERY = `
  query Obligations($user: Bytes!) {
    committeds(where: { user: $user }, orderBy: unlockDate, orderDirection: asc, first: 100) {
      commitmentId
      amount
      unlockDate
      label
      blockTimestamp
      transactionHash
    }
    releaseds(where: { user: $user }, first: 100) {
      commitmentId
    }
  }
`;

type SubgraphCommitted = {
  commitmentId: string;
  amount: string;
  unlockDate: string;
  label: string;
  blockTimestamp: string;
  transactionHash: string;
};

type SubgraphReleased = { commitmentId: string };

type Obligation = {
  commitmentId: string;
  label: string;
  amount: string;
  amountWei: string;
  unlockDate: string;
  unlockTimestamp: number;
  transactionHash: string;
};

const client = createPublicClient({
  chain: sepolia,
  transport: http(),
});

const ETH_AMOUNT_PATTERN = /^\d+(\.\d+)?$/;

/**
 * Upcoming obligations are descriptive context from indexed history, not the verdict —
 * a failed or slow subgraph shouldn't block the live canSpend/freeBalance result below,
 * so this degrades to an empty list rather than failing the whole request.
 */
async function fetchUpcomingObligations(wallet: Address): Promise<{ obligations: Obligation[]; available: boolean }> {
  try {
    const res = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: OBLIGATIONS_QUERY, variables: { user: wallet.toLowerCase() } }),
    });
    if (!res.ok) return { obligations: [], available: false };

    const json = await res.json();
    if (json.errors || !json.data) return { obligations: [], available: false };

    const committeds = json.data.committeds as SubgraphCommitted[];
    const releaseds = json.data.releaseds as SubgraphReleased[];
    const releasedIds = new Set(releaseds.map((r) => r.commitmentId));

    // An "obligation" is a commitment that hasn't been released yet — same released/active
    // distinction the live contract uses, just derived here from the indexed event history.
    const obligations = committeds
      .filter((c) => !releasedIds.has(c.commitmentId))
      .map(
        (c): Obligation => ({
          commitmentId: c.commitmentId,
          label: c.label,
          amount: formatEther(BigInt(c.amount)),
          amountWei: c.amount,
          unlockDate: formatDate(BigInt(c.unlockDate)),
          unlockTimestamp: Number(c.unlockDate),
          transactionHash: c.transactionHash,
        })
      );

    return { obligations, available: true };
  } catch {
    return { obligations: [], available: false };
  }
}

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");
  const amount = request.nextUrl.searchParams.get("amount");

  if (!wallet || !isAddress(wallet)) {
    return Response.json({ error: "wallet must be a valid address." }, { status: 400 });
  }
  if (!amount || !ETH_AMOUNT_PATTERN.test(amount.trim())) {
    return Response.json({ error: 'amount must be a plain positive decimal ETH value, e.g. "0.003".' }, { status: 400 });
  }

  let amountWei: bigint;
  try {
    amountWei = parseEther(amount.trim());
  } catch {
    return Response.json({ error: "amount could not be parsed as ETH." }, { status: 400 });
  }

  try {
    const [freeBalanceWei, canSpendResult, commitments, { obligations, available: subgraphAvailable }] =
      await Promise.all([
        client.readContract({
          address: LEVEE_ADDRESS,
          abi: LEVEE_ABI,
          functionName: "freeBalance",
          args: [wallet],
        }),
        client.readContract({
          address: LEVEE_ADDRESS,
          abi: LEVEE_ABI,
          functionName: "canSpend",
          args: [wallet, amountWei],
        }),
        client.readContract({
          address: LEVEE_ADDRESS,
          abi: LEVEE_ABI,
          functionName: "commitmentsOf",
          args: [wallet],
        }),
        fetchUpcomingObligations(wallet),
      ]);

    const [allowed, blockingId, blockingLabel, blockingUnlockDate] = canSpendResult;

    const blockingCommitment = allowed
      ? null
      : {
          label: blockingLabel,
          amount: formatEther(commitments[Number(blockingId)]?.amount ?? 0n),
          unlockDate: formatDate(blockingUnlockDate),
        };

    const reasoning = allowed
      ? `${amount} ETH is spendable because it does not exceed your current free balance.`
      : `${amount} ETH cannot be spent because it is blocked by the "${blockingLabel}" hold until ${formatDate(blockingUnlockDate)}.`;

    return Response.json({
      allowed,
      freeBalance: formatEther(freeBalanceWei),
      blockingCommitment,
      upcomingObligations: obligations,
      reasoning,
      sources: {
        verdict: "Live on-chain read (canSpend + freeBalance via the Levee contract).",
        upcomingObligations: subgraphAvailable
          ? "The Graph subgraph — indexed Committed/Released events, may lag the latest block slightly."
          : "The Graph subgraph was unavailable, so this list is empty; the verdict above is unaffected.",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return Response.json({ error: message }, { status: 502 });
  }
}
