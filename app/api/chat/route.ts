import { createPublicClient, formatEther, http, isAddress, type Address } from "viem";
import { sepolia } from "viem/chains";
import { LEVEE_ABI, LEVEE_ADDRESS } from "@/lib/leveeAbi";
import { formatDate } from "@/lib/dates";

export const maxDuration = 30;

const SUBGRAPH_URL = "https://api.studio.thegraph.com/query/1760220/levee-sepolia/v0.0.1";
const GEMINI_MODEL = "gemini-2.5-flash";

// Copied from app/api/spend-check/route.ts, which is confirmed working on Vercel.
const client = createPublicClient({
  chain: sepolia,
  transport: http(),
});

const HISTORY_QUERY = `
  query History($user: Bytes!) {
    committeds(where: { user: $user }, orderBy: blockTimestamp, orderDirection: desc, first: 10) {
      amount
      unlockDate
      label
      blockTimestamp
    }
    releaseds(where: { user: $user }, orderBy: blockTimestamp, orderDirection: desc, first: 10) {
      amount
      blockTimestamp
    }
    spents(where: { user: $user }, orderBy: blockTimestamp, orderDirection: desc, first: 10) {
      to
      amount
      blockTimestamp
    }
  }
`;

type SubgraphHistory = {
  committeds: { amount: string; unlockDate: string; label: string; blockTimestamp: string }[];
  releaseds: { amount: string; blockTimestamp: string }[];
  spents: { to: string; amount: string; blockTimestamp: string }[];
};

/** Same plain-HTTP-POST pattern as app/api/spend-check/route.ts. Degrades to null on any failure. */
async function fetchHistory(wallet: Address): Promise<SubgraphHistory | null> {
  try {
    const res = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: HISTORY_QUERY, variables: { user: wallet.toLowerCase() } }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.errors || !json.data) return null;
    return json.data as SubgraphHistory;
  } catch {
    return null;
  }
}

function buildPrompt(
  freeBalanceWei: bigint,
  commitments: readonly { amount: bigint; unlockDate: bigint; label: string; released: boolean }[],
  history: SubgraphHistory | null,
  question: string
): string {
  const lines: string[] = [];
  lines.push(`Free (spendable) balance: ${formatEther(freeBalanceWei)} ETH.`);

  const active = commitments.filter((c) => !c.released);
  const released = commitments.filter((c) => c.released);

  lines.push(active.length === 0 ? "No active holds." : "Active holds:");
  for (const c of active) {
    lines.push(`- "${c.label}": ${formatEther(c.amount)} ETH, releases on ${formatDate(c.unlockDate)}.`);
  }

  if (released.length > 0) {
    lines.push("Released holds:");
    for (const c of released) {
      lines.push(`- "${c.label}": ${formatEther(c.amount)} ETH, already released.`);
    }
  }

  if (!history) {
    lines.push("Historical event data (from the Subgraph) is temporarily unavailable.");
  } else {
    lines.push("Recent commit history:");
    if (history.committeds.length === 0) {
      lines.push("- None.");
    } else {
      for (const c of history.committeds) {
        lines.push(
          `- Committed ${formatEther(BigInt(c.amount))} ETH labeled "${c.label}", unlocking ${formatDate(BigInt(c.unlockDate))}.`
        );
      }
    }

    lines.push("Recent release history:");
    if (history.releaseds.length === 0) {
      lines.push("- None.");
    } else {
      for (const r of history.releaseds) {
        lines.push(`- Released ${formatEther(BigInt(r.amount))} ETH on ${formatDate(BigInt(r.blockTimestamp))}.`);
      }
    }

    lines.push("Recent spend history:");
    if (history.spents.length === 0) {
      lines.push("- None.");
    } else {
      for (const s of history.spents) {
        lines.push(`- Spent ${formatEther(BigInt(s.amount))} ETH to ${s.to} on ${formatDate(BigInt(s.blockTimestamp))}.`);
      }
    }
  }

  return (
    "You are Levee, a calm financial assistant for a DeFi wallet. Answer only from the data below. " +
    "Never invent data. Do not use Markdown (no **, *, #, or bullet symbols). Keep the answer short and plain.\n\n" +
    `User's financial state:\n${lines.join("\n")}\n\nUser's question: ${question}`
  );
}

export async function POST(request: Request) {
  console.log("HANDLER START");

  try {
    let body: { question?: unknown; walletAddress?: unknown };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const { question, walletAddress } = body;

    if (typeof question !== "string" || question.trim().length === 0) {
      return Response.json({ error: "question is required." }, { status: 400 });
    }
    if (typeof walletAddress !== "string" || !isAddress(walletAddress)) {
      return Response.json({ error: "walletAddress must be a valid address." }, { status: 400 });
    }

    const [freeBalanceWei, commitments, history] = await Promise.all([
      client.readContract({
        address: LEVEE_ADDRESS,
        abi: LEVEE_ABI,
        functionName: "freeBalance",
        args: [walletAddress],
      }),
      client.readContract({
        address: LEVEE_ADDRESS,
        abi: LEVEE_ABI,
        functionName: "commitmentsOf",
        args: [walletAddress],
      }),
      fetchHistory(walletAddress),
    ]);

    const prompt = buildPrompt(freeBalanceWei, commitments, history, question);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "GEMINI_API_KEY is not configured on the server." }, { status: 500 });
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    console.log(`[chat] calling Gemini: model=${GEMINI_MODEL}`);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
    });
    console.log(`[chat] Gemini fetch returned: status=${res.status}`);

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[chat] Gemini API request failed: status=${res.status} body=${detail || res.statusText}`);
      return Response.json(
        { error: `Gemini API request failed (${res.status}): ${detail || res.statusText}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (typeof answer !== "string" || answer.length === 0) {
      console.error(`[chat] Gemini returned no answer text. Raw response: ${JSON.stringify(data)}`);
      return Response.json({ error: "Gemini API returned no answer." }, { status: 502 });
    }

    return Response.json({ answer });
  } catch (err) {
    console.error(`[chat] Unhandled error: ${err instanceof Error ? err.stack || err.message : String(err)}`);
    const message = err instanceof Error ? err.message : "Unknown error.";
    return Response.json({ error: message }, { status: 500 });
  }
}
