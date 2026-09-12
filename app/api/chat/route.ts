import { createPublicClient, formatEther, http, isAddress, parseEther } from "viem";
import { sepolia } from "viem/chains";
import { LEVEE_ABI, LEVEE_ADDRESS } from "@/lib/leveeAbi";
import { formatDate } from "@/lib/dates";

const SAMPLE_AMOUNTS_ETH = ["0.001", "0.005", "0.01"] as const;

const SUBGRAPH_URL = "https://api.studio.thegraph.com/query/1760220/levee-sepolia/v0.0.1";

const HISTORY_QUERY = `
  query History($user: Bytes!) {
    committeds(where: { user: $user }, orderBy: blockTimestamp, orderDirection: desc, first: 10) {
      commitmentId
      amount
      unlockDate
      label
      blockTimestamp
      transactionHash
    }
    releaseds(where: { user: $user }, orderBy: blockTimestamp, orderDirection: desc, first: 10) {
      commitmentId
      amount
      blockTimestamp
      transactionHash
    }
    spents(where: { user: $user }, orderBy: blockTimestamp, orderDirection: desc, first: 10) {
      to
      amount
      blockTimestamp
      transactionHash
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

type SubgraphReleased = {
  commitmentId: string;
  amount: string;
  blockTimestamp: string;
  transactionHash: string;
};

type SubgraphSpent = {
  to: string;
  amount: string;
  blockTimestamp: string;
  transactionHash: string;
};

type SubgraphHistory = {
  committeds: SubgraphCommitted[];
  releaseds: SubgraphReleased[];
  spents: SubgraphSpent[];
};

const SYSTEM_INSTRUCTION =
  "You are Levee, a calm financial assistant. Answer only from the data provided. " +
  "Use the user's real numbers and commitment names. Never invent data. Be concise and reassuring.";

const client = createPublicClient({
  chain: sepolia,
  transport: http(),
});

/**
 * Subgraph indexing lag or an outage shouldn't take down the whole chat feature —
 * the live contract reads below are the source of truth for current state, so a
 * failed history fetch just means the context omits the historical section.
 */
async function fetchHistory(walletAddress: `0x${string}`): Promise<SubgraphHistory | null> {
  try {
    const res = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: HISTORY_QUERY, variables: { user: walletAddress.toLowerCase() } }),
    });
    if (!res.ok) return null;

    const json = await res.json();
    if (json.errors || !json.data) return null;
    return json.data as SubgraphHistory;
  } catch {
    return null;
  }
}

async function buildContext(walletAddress: `0x${string}`) {
  const historyPromise = fetchHistory(walletAddress);

  const [freeBalance, commitments] = await Promise.all([
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
  ]);

  const spendChecks = await Promise.all(
    SAMPLE_AMOUNTS_ETH.map(async (ethAmount) => {
      const [allowed] = await client.readContract({
        address: LEVEE_ADDRESS,
        abi: LEVEE_ABI,
        functionName: "canSpend",
        args: [walletAddress, parseEther(ethAmount)],
      });
      return { ethAmount, allowed };
    })
  );

  const lines: string[] = [];
  lines.push(`Free (spendable) balance: ${formatEther(freeBalance)} ETH.`);

  const active = commitments.filter((c) => !c.released);
  const released = commitments.filter((c) => c.released);

  if (active.length === 0) {
    lines.push("No active holds.");
  } else {
    lines.push("Active holds:");
    for (const c of active) {
      lines.push(
        `- "${c.label}": ${formatEther(c.amount)} ETH, releases on ${formatDate(c.unlockDate)}.`
      );
    }
  }

  if (released.length > 0) {
    lines.push("Released holds:");
    for (const c of released) {
      lines.push(`- "${c.label}": ${formatEther(c.amount)} ETH, already released.`);
    }
  }

  lines.push("Spendability check for sample amounts:");
  for (const { ethAmount, allowed } of spendChecks) {
    lines.push(`- ${ethAmount} ETH: ${allowed ? "spendable now" : "blocked by a hold"}.`);
  }

  const history = await historyPromise;
  if (!history) {
    lines.push("Historical on-chain event data is temporarily unavailable.");
  } else {
    const { committeds, releaseds, spents } = history;

    lines.push("Recent commit history (most recent first, from indexed events):");
    if (committeds.length === 0) {
      lines.push("- No commit events found.");
    } else {
      for (const c of committeds) {
        lines.push(
          `- Committed ${formatEther(BigInt(c.amount))} ETH labeled "${c.label}" on ` +
            `${formatDate(BigInt(c.blockTimestamp))}, unlocking ${formatDate(BigInt(c.unlockDate))}.`
        );
      }
    }

    lines.push("Recent release history (most recent first, from indexed events):");
    if (releaseds.length === 0) {
      lines.push("- No release events found.");
    } else {
      for (const r of releaseds) {
        lines.push(`- Released ${formatEther(BigInt(r.amount))} ETH on ${formatDate(BigInt(r.blockTimestamp))}.`);
      }
    }

    lines.push("Recent spend history (most recent first, from indexed events):");
    if (spents.length === 0) {
      lines.push("- No spend events found.");
    } else {
      const totalSpent = spents.reduce((sum, s) => sum + BigInt(s.amount), 0n);
      lines.push(`- Total spent across these events: ${formatEther(totalSpent)} ETH.`);
      for (const s of spents) {
        lines.push(`- Spent ${formatEther(BigInt(s.amount))} ETH to ${s.to} on ${formatDate(BigInt(s.blockTimestamp))}.`);
      }
    }
  }

  return lines.join("\n");
}

async function askGemini(context: string, question: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [
          {
            role: "user",
            parts: [{ text: `User's real financial state:\n${context}\n\nUser's question: ${question}` }],
          },
        ],
      }),
    }
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gemini API request failed (${res.status}): ${detail || res.statusText}`);
  }

  const data = await res.json();
  const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof answer !== "string" || answer.length === 0) {
    throw new Error("Gemini API returned no answer.");
  }

  return answer;
}

export async function POST(request: Request) {
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

  try {
    const context = await buildContext(walletAddress);
    const answer = await askGemini(context, question);
    return Response.json({ answer });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return Response.json({ error: message }, { status: 502 });
  }
}
