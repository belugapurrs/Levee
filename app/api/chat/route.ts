import { createPublicClient, formatEther, http, isAddress, parseEther } from "viem";
import { sepolia } from "viem/chains";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { LEVEE_ABI, LEVEE_ADDRESS } from "@/lib/leveeAbi";
import { formatDate } from "@/lib/dates";

// Vercel's default function timeout is 300s, which is far too long to let a hung Gemini
// call sit before the platform kills it — cap it much lower so a stuck request fails fast
// with a real error instead of a silent 300s timeout.
export const maxDuration = 30;

const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_TIMEOUT_MS = 20_000;

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

type UnifiedEvent = {
  type: "commit" | "release" | "spend";
  amount: bigint;
  blockTimestamp: bigint;
  label?: string;
  to?: string;
  unlockDate?: bigint;
};

const RECENT_PER_TYPE_LIMIT = 5;
const UNIFIED_HISTORY_LIMIT = 6;

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatCommitItem(c: SubgraphCommitted): string {
  return (
    `${c.label} — ${formatEther(BigInt(c.amount))} ETH\n` +
    `Unlocks ${formatDate(BigInt(c.unlockDate))} (committed ${formatDate(BigInt(c.blockTimestamp))})`
  );
}

function formatReleaseItem(r: SubgraphReleased): string {
  return `Released ${formatEther(BigInt(r.amount))} ETH\n${formatDate(BigInt(r.blockTimestamp))}`;
}

function formatSpendItem(s: SubgraphSpent): string {
  return `Sent ${formatEther(BigInt(s.amount))} ETH to ${shortAddress(s.to)}\n${formatDate(BigInt(s.blockTimestamp))}`;
}

/** Merges the three event types into one feed sorted newest-first, for general "history" questions. */
function mergeUnifiedHistory(history: SubgraphHistory, limit: number): UnifiedEvent[] {
  const events: UnifiedEvent[] = [
    ...history.committeds.map(
      (c): UnifiedEvent => ({
        type: "commit",
        amount: BigInt(c.amount),
        blockTimestamp: BigInt(c.blockTimestamp),
        label: c.label,
        unlockDate: BigInt(c.unlockDate),
      })
    ),
    ...history.releaseds.map(
      (r): UnifiedEvent => ({ type: "release", amount: BigInt(r.amount), blockTimestamp: BigInt(r.blockTimestamp) })
    ),
    ...history.spents.map(
      (s): UnifiedEvent => ({ type: "spend", amount: BigInt(s.amount), blockTimestamp: BigInt(s.blockTimestamp), to: s.to })
    ),
  ];
  events.sort((a, b) => (a.blockTimestamp < b.blockTimestamp ? 1 : a.blockTimestamp > b.blockTimestamp ? -1 : 0));
  return events.slice(0, limit);
}

function formatUnifiedItem(e: UnifiedEvent): string {
  const amount = `${formatEther(e.amount)} ETH`;
  const date = formatDate(e.blockTimestamp);
  if (e.type === "commit") {
    return `Committed ${amount} — "${e.label}"\n${date}, unlocks ${formatDate(e.unlockDate as bigint)}`;
  }
  if (e.type === "release") {
    return `Released ${amount}\n${date}`;
  }
  return `Sent ${amount} to ${shortAddress(e.to as string)}\n${date}`;
}

const SYSTEM_INSTRUCTION =
  "You are Levee, a calm financial assistant for a DeFi wallet. Answer only from the data provided " +
  "or from the query_subgraph_mcp tool. Never invent data.\n\n" +
  "FORMATTING (strict):\n" +
  "- Never use Markdown: no **, *, #, backticks, or markdown-style bullets.\n" +
  "- Plain text only, short lines.\n" +
  "- When listing items (commitments, releases, spends, transactions), put one blank line between " +
  "each item. Each item is two short lines: a label/amount line, then a detail/date line. Example:\n\n" +
  "Recent commitments\n\n" +
  "loan — 0.00002 ETH\n" +
  "Unlocks 23 Oct 2026\n\n" +
  "bday — 0.006 ETH\n" +
  "Unlocks 2 Dec 2026\n\n" +
  "CONCISENESS:\n" +
  "- Do not repeat the user's question.\n" +
  "- No filler, no reassurance, no generic financial advice.\n" +
  "- Give only what answers the question — normally 1 to 6 short lines or items.\n\n" +
  "CURRENT STATE VS HISTORY:\n" +
  "- \"Active holds\" and \"Released holds\" above are live, current contract state — use these for " +
  "\"what do I currently have\" questions.\n" +
  "- The historical-events section is from indexed past events and can include holds that are no " +
  "longer active. Never present a historical event as the user's current status.\n\n" +
  "RECENCY LIMITS:\n" +
  "- A question about one event type only (\"what did I commit/release/spend recently\"): at most " +
  `${RECENT_PER_TYPE_LIMIT} items, from the matching "Recent commitments/releases/spends" section.\n` +
  "- A general \"recent transactions\" or \"transaction history\" question covering mixed event types: " +
  `at most ${UNIFIED_HISTORY_LIMIT} items TOTAL, from the "Unified recent transaction history" ` +
  "section. Do not split that answer into per-type sub-sections.\n\n" +
  "SPENDING TOTALS:\n" +
  "- Never sum the \"Recent spends\" list and call it a total or lifetime amount — it is only the most " +
  "recent indexed events, not the full history.\n" +
  "- If asked how much the user has spent in total, either call query_subgraph_mcp for a larger window " +
  "and say the figure covers only the events retrieved, or say plainly that only recent indexed events " +
  "are available and give that partial figure with that caveat.\n\n" +
  "NUMBERS:\n" +
  "- Use ETH amounts exactly as given. Do not round, reformat, or recompute them.\n\n" +
  "TOOL USE:\n" +
  "- Call query_subgraph_mcp only if the data above doesn't cover the question (e.g. more items than " +
  "shown, or a time range not covered). It is automatically scoped to this user's wallet — you cannot " +
  "query any other address.";

// Gemini decides when to call this — the natural-language layer is what actually drives
// The Graph's Subgraph MCP server, rather than the route silently pre-fetching through it.
// The wallet filter is never exposed as a parameter: the model can only choose which entity,
// how many, and in what order — the `where: { user }` clause is always injected server-side
// in callSubgraphMcp, so a query can never reach across wallets.
const MCP_TOOL_DECLARATION = {
  name: "query_subgraph_mcp",
  description:
    "Fetch additional historical Levee events beyond what's already provided above. Automatically " +
    "scoped to the connected wallet — you cannot query any other address or add your own filter. " +
    "Only call this if the question needs more historical detail than what's already in the financial " +
    "state above.",
  parameters: {
    type: "OBJECT",
    properties: {
      entity: {
        type: "STRING",
        enum: ["committeds", "releaseds", "spents"],
        description: "Which kind of historical event to fetch.",
      },
      first: {
        type: "NUMBER",
        description: "Maximum number of results, 1 to 25. Defaults to 10.",
      },
      orderDirection: {
        type: "STRING",
        enum: ["asc", "desc"],
        description: "Sort order by time. Defaults to desc (most recent first).",
      },
    },
    required: ["entity"],
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

const MCP_ENTITY_FIELDS: Record<"committeds" | "releaseds" | "spents", string> = {
  committeds: "commitmentId amount unlockDate label blockTimestamp transactionHash",
  releaseds: "commitmentId amount blockTimestamp transactionHash",
  spents: "to amount blockTimestamp transactionHash",
};

/**
 * Opens a short-lived connection to The Graph's hosted Subgraph MCP server and runs one
 * tool call. A fresh connection per call is fine here: this only runs when Gemini's
 * function-calling decides it needs it, not on every chat request.
 *
 * Gemini only ever chooses `entity`/`first`/`orderDirection` — the query text (including
 * the `where: { user }` filter) is always built here, server-side, from the connected
 * wallet. The model has no parameter through which it could supply its own filter or
 * address, so a call can never return another wallet's data.
 */
async function callSubgraphMcp(walletAddress: `0x${string}`, args: Record<string, unknown>): Promise<string> {
  const apiKey = process.env.GRAPH_GATEWAY_API_KEY;
  if (!apiKey) {
    throw new Error("GRAPH_GATEWAY_API_KEY is not configured on the server.");
  }

  const entity = args.entity;
  if (entity !== "committeds" && entity !== "releaseds" && entity !== "spents") {
    throw new Error('entity must be one of "committeds", "releaseds", or "spents".');
  }

  const first = Math.min(Math.max(Math.trunc(Number(args.first)) || 10, 1), 25);
  const orderDirection = args.orderDirection === "asc" ? "asc" : "desc";

  const query = `
    query($user: Bytes!) {
      ${entity}(where: { user: $user }, orderBy: blockTimestamp, orderDirection: ${orderDirection}, first: ${first}) {
        ${MCP_ENTITY_FIELDS[entity]}
      }
    }
  `;

  const ipfsHash = await fetchDeploymentIpfsHash();

  const transport = new SSEClientTransport(new URL(SUBGRAPH_MCP_URL), {
    requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
  });
  const mcp = new McpClient({ name: "levee-chat", version: "1.0.0" });

  try {
    await mcp.connect(transport);
    const result = await mcp.callTool({
      name: "execute_query_by_ipfs_hash",
      arguments: { ipfs_hash: ipfsHash, query, variables: { user: walletAddress.toLowerCase() } },
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
    lines.push("Active holds (current, live from the contract):");
    for (const c of active) {
      lines.push(
        `- "${c.label}": ${formatEther(c.amount)} ETH, releases on ${formatDate(c.unlockDate)}.`
      );
    }
  }

  if (released.length > 0) {
    lines.push("Released holds (current, live from the contract):");
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
    lines.push("");
    lines.push("Historical on-chain event data is temporarily unavailable.");
    return lines.join("\n");
  }

  // Only the capped/merged results below are handed to Gemini — never the raw fetched
  // events — so there's no risk of a "recent" question dumping dozens of rows into context.
  const recentCommits = history.committeds.slice(0, RECENT_PER_TYPE_LIMIT);
  const recentReleases = history.releaseds.slice(0, RECENT_PER_TYPE_LIMIT);
  const recentSpends = history.spents.slice(0, RECENT_PER_TYPE_LIMIT);
  const unifiedHistory = mergeUnifiedHistory(history, UNIFIED_HISTORY_LIMIT);

  lines.push("");
  lines.push("--- Historical event data below (indexed past events, separate from current state above) ---");

  lines.push("");
  lines.push(`Recent commitments (up to ${RECENT_PER_TYPE_LIMIT}, most recent first):`);
  lines.push(recentCommits.length === 0 ? "None found." : recentCommits.map(formatCommitItem).join("\n\n"));

  lines.push("");
  lines.push(`Recent releases (up to ${RECENT_PER_TYPE_LIMIT}, most recent first):`);
  lines.push(recentReleases.length === 0 ? "None found." : recentReleases.map(formatReleaseItem).join("\n\n"));

  lines.push("");
  lines.push(
    `Recent spends (up to ${RECENT_PER_TYPE_LIMIT}, most recent first — NOT a full lifetime total, only these indexed events):`
  );
  lines.push(recentSpends.length === 0 ? "None found." : recentSpends.map(formatSpendItem).join("\n\n"));

  lines.push("");
  lines.push(`Unified recent transaction history (up to ${UNIFIED_HISTORY_LIMIT}, most recent first, all types merged):`);
  lines.push(unifiedHistory.length === 0 ? "None found." : unifiedHistory.map(formatUnifiedItem).join("\n\n"));

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

async function askGemini(context: string, question: string, walletAddress: `0x${string}`) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const contents: GeminiContent[] = [
    {
      role: "user",
      parts: [{ text: `User's real financial state:\n${context}\n\nUser's question: ${question}` }],
    },
  ];

  const callGemini = async () => {
    // A hung Gemini call must never be allowed to ride out Vercel's full function timeout —
    // abort it ourselves well before that so the route always returns a real JSON error.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          tools: [{ functionDeclarations: [MCP_TOOL_DECLARATION] }],
          contents,
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        console.error(`Gemini API request timed out after ${GEMINI_TIMEOUT_MS}ms (model=${GEMINI_MODEL}).`);
        throw new Error(`Gemini API request timed out after ${GEMINI_TIMEOUT_MS / 1000}s.`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`Gemini API request failed: status=${res.status} model=${GEMINI_MODEL} body=${detail || res.statusText}`);
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
        name === "query_subgraph_mcp"
          ? await callSubgraphMcp(walletAddress, args ?? {})
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
    const answer = await askGemini(context, question, walletAddress);
    return Response.json({ answer });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return Response.json({ error: message }, { status: 502 });
  }
}
