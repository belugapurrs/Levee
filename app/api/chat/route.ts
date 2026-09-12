import { createPublicClient, formatEther, http, isAddress, parseEther } from "viem";
import { sepolia } from "viem/chains";
import { LEVEE_ABI, LEVEE_ADDRESS } from "@/lib/leveeAbi";
import { formatDate } from "@/lib/dates";

const SAMPLE_AMOUNTS_ETH = ["0.001", "0.005", "0.01"] as const;

const SYSTEM_INSTRUCTION =
  "You are Levee, a calm financial assistant. Answer only from the data provided. " +
  "Use the user's real numbers and commitment names. Never invent data. Be concise and reassuring.";

const client = createPublicClient({
  chain: sepolia,
  transport: http(),
});

async function buildContext(walletAddress: `0x${string}`) {
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
