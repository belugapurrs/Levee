import { createPublicClient, formatEther, http, isAddress, parseEther } from "viem";
import { sepolia } from "viem/chains";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { LEVEE_ABI, LEVEE_ADDRESS } from "@/lib/leveeAbi";
import { formatDate } from "@/lib/dates";

const SAMPLE_AMOUNTS_ETH = ["0.001", "0.005", "0.01"] as const;

const SUBGRAPH_URL = "https://api.studio.thegraph.com/query/1760220/levee-sepolia/v0.0.1";
const SUBGRAPH_MCP_URL = "https://subgraphs.mcp.thegraph.com/sse";

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
  "Use the user's real numbers and commitment names. Never invent data. " +
  "Keep answers concise and natural. Do not use Markdown formatting such as **, *, #, or bullet symbols. " +
  "Use simple plain text with short lines. Do not add unnecessary reassurance or filler. " +
  "If you need historical data beyond what's already given, call query_subgraph_mcp with a GraphQL query.";

// Gemini decides when to call this — the natural-language layer is what actually drives
// The Graph's Subgraph MCP server, rather than the route silently pre-fetching through it.
const MCP_TOOL_DECLARATION = {
  name: "query_subgraph_mcp",
  description:
    "Run an ad hoc GraphQL query against the Levee subgraph via The Graph's Subgraph MCP server. " +
    "Only use this if the question needs data beyond what's already in the financial state above " +
    "(e.g. a different time range, ordering, or field). Schema entities: committeds (commitmentId, " +
    "amount, unlockDate, label, blockTimestamp, transactionHash, user), releaseds (commitmentId, amount, " +
    "blockTimestamp, transactionHash, user), spents (to, amount, blockTimestamp, transactionHash, user). " +
    "All filterable by user: Bytes.",
  parameters: {
    type: "OBJECT",
    properties: {
      query: { type: "STRING", description: 'A GraphQL query string, e.g. "{ spents(first: 5) { amount } }".' },
    },
    required: ["query"],
  },
};

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

/** The MCP tools address deployments by IPFS hash, not the Studio query URL, so resolve it live. */
async function fetchDeploymentIpfsHash(): Promise<string> {
  const res = await fetch(SUBGRAPH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "{ _meta { deployment } }" }),
  });
  const json = await res.json();
  const hash = json?.data?._meta?.deployment;
  if (typeof hash !== "string") {
    throw new Error("Could not resolve the subgraph's deployment hash.");
  }
  return hash;
}

/**
 * Opens a short-lived connection to The Graph's hosted Subgraph MCP server and runs one
 * tool call. A fresh connection per call is fine here: this only runs when Gemini's
 * function-calling decides it needs it, not on every chat request.
 */
async function callSubgraphMcp(query: string): Promise<string> {
  const apiKey = process.env.GRAPH_GATEWAY_API_KEY;
  if (!apiKey) {
    throw new Error("GRAPH_GATEWAY_API_KEY is not configured on the server.");
  }

  const ipfsHash = await fetchDeploymentIpfsHash();

  const transport = new SSEClientTransport(new URL(SUBGRAPH_MCP_URL), {
    requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
  });
  const mcp = new McpClient({ name: "levee-chat", version: "1.0.0" });

  try {
    await mcp.connect(transport);
    const result = await mcp.callTool({
      name: "execute_query_by_ipfs_hash",
      arguments: { ipfs_hash: ipfsHash, query },
    });

    const content = Array.isArray(result.content) ? result.content : [];
    const textPart = content.find(
      (part): part is { type: "text"; text: string } => part.type === "text" && typeof part.text === "string"
    );
    return textPart?.text ?? JSON.stringify(result.content ?? {});
  } finally {
    await mcp.close();
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

type GeminiPart = {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: { result: string } };
  // Gemini 3's thinking models require this echoed back verbatim on the function-call
  // turn, or the follow-up request is rejected — so the whole part is replayed as-is
  // below rather than reconstructed from just `functionCall`.
  thoughtSignature?: string;
};
type GeminiContent = { role: string; parts: GeminiPart[] };

async function askGemini(context: string, question: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;

  const contents: GeminiContent[] = [
    {
      role: "user",
      parts: [{ text: `User's real financial state:\n${context}\n\nUser's question: ${question}` }],
    },
  ];

  const callGemini = async () => {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        tools: [{ functionDeclarations: [MCP_TOOL_DECLARATION] }],
        contents,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Gemini API request failed (${res.status}): ${detail || res.statusText}`);
    }
    const data = await res.json();
    return (data?.candidates?.[0]?.content?.parts ?? []) as GeminiPart[];
  };

  let parts = await callGemini();

  // Bounded, not single-shot: if the tool call errors (e.g. the subgraph isn't reachable
  // for some reason), the model may retry once or twice with a different query before
  // giving up and answering in text — so keep going until it stops asking for the tool.
  const MAX_TOOL_ROUNDS = 3;
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const functionCallPart = parts.find((p) => p.functionCall);
    if (!functionCallPart?.functionCall) break;

    const { name, args } = functionCallPart.functionCall;
    let toolResult: string;
    try {
      toolResult =
        name === "query_subgraph_mcp" && typeof args?.query === "string"
          ? await callSubgraphMcp(args.query)
          : `Unknown tool: ${name}`;
    } catch (err) {
      toolResult = `Tool error: ${err instanceof Error ? err.message : "unknown error"}`;
    }

    contents.push({ role: "model", parts: [functionCallPart] });
    contents.push({ role: "user", parts: [{ functionResponse: { name, response: { result: toolResult } } }] });

    parts = await callGemini();
  }

  const answer = parts.find((p) => typeof p.text === "string")?.text;
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
