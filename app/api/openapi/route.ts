const OPENAPI_SPEC = {
  openapi: "3.0.3",
  info: {
    title: "Levee Spend-Check API",
    version: "1.0.0",
    description:
      "Levee is a wallet where money committed to a future date cannot be withdrawn early. " +
      "This API answers one question precisely: given a wallet and a specific ETH amount, is that " +
      "amount actually spendable right now? The verdict (allowed, freeBalance, blockingCommitment) " +
      "is read live from the Levee smart contract on Ethereum Sepolia, so it always reflects current " +
      "on-chain state — never call this speculatively or cache its result, since the answer can change " +
      "as soon as a hold unlocks or a new commitment is made. The upcomingObligations list is separate, " +
      "descriptive context sourced from an indexed Subgraph rather than the live contract, so it may lag " +
      "the latest block by a few seconds; it exists to explain *why* money is held, not to determine the " +
      "verdict itself.",
  },
  servers: [
    {
      url: "https://levee-seven.vercel.app",
      description: "Production",
    },
  ],
  paths: {
    "/api/spend-check": {
      get: {
        operationId: "checkSpendability",
        summary: "Check whether a specific ETH amount is spendable from a wallet right now.",
        description:
          "Call this whenever you need to know if a user can spend a specific ETH amount from their " +
          "Levee wallet — for example before recommending a purchase, before drafting a transaction, or " +
          "when the user directly asks something like \"can I spend 0.01 ETH?\". Do not use this for " +
          "amounts you have not confirmed with the user; it returns a real verdict for the exact amount " +
          "given, not an estimate or a range. If the amount is blocked, `blockingCommitment` and " +
          "`reasoning` explain which hold is responsible and when it unlocks, so you can tell the user " +
          "when the amount would become spendable instead of just that it currently isn't.",
        parameters: [
          {
            name: "wallet",
            in: "query",
            required: true,
            description:
              "The Ethereum wallet address to check, as a 0x-prefixed 40-hex-character address " +
              "(EIP-55 checksum or plain lowercase are both accepted). This must be the actual address " +
              "whose Levee balance and holds you want checked — never a placeholder or an address the " +
              "user hasn't confirmed. Invalid or missing addresses return a 400 error, not a verdict.",
            schema: {
              type: "string",
              pattern: "^0x[a-fA-F0-9]{40}$",
              example: "0x8330bdfb84f72c364fd8083a3ac221ee642b85de",
            },
          },
          {
            name: "amount",
            in: "query",
            required: true,
            description:
              "The ETH amount to check, as a plain positive decimal string — for example \"0.01\" or " +
              "\"1.5\". Do not use scientific notation, a leading '+' or '-' sign, commas, or a currency " +
              "symbol; only digits and at most one decimal point are accepted. This is the exact amount " +
              "the verdict is computed for — asking about \"0.01\" does not tell you anything about " +
              "whether \"0.02\" is spendable, since a different amount can cross a different hold's " +
              "threshold. Invalid or missing amounts return a 400 error, not a verdict.",
            schema: {
              type: "string",
              pattern: "^\\d+(\\.\\d+)?$",
              example: "0.003",
            },
          },
        ],
        responses: {
          "200": {
            description:
              "A verdict was computed successfully. Always check `allowed` first — it is the direct " +
              "answer to \"can this amount be spent right now\"; every other field is supporting context.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["allowed", "freeBalance", "blockingCommitment", "upcomingObligations", "reasoning", "sources"],
                  properties: {
                    allowed: {
                      type: "boolean",
                      description:
                        "The verdict. true if the requested amount can be spent right now without " +
                        "touching any held/committed funds; false if spending it would require dipping " +
                        "into a hold that hasn't unlocked yet. This is a live read from the contract's " +
                        "canSpend() function, not an approximation.",
                    },
                    freeBalance: {
                      type: "string",
                      description:
                        "The wallet's total spendable balance right now, in ETH, as a decimal string " +
                        "(e.g. \"0.00398899979\") — not wei, and not the wallet's total balance including " +
                        "held funds. This is the ceiling: any requested amount at or below this figure " +
                        "will have allowed=true, and any amount above it will not.",
                      example: "0.00398899979",
                    },
                    blockingCommitment: {
                      description:
                        "If allowed is false, the specific hold responsible for blocking the requested " +
                        "amount — the earliest-unlocking commitment that the requested amount would " +
                        "otherwise dip into. Null whenever allowed is true; do not treat a null value as " +
                        "an error.",
                      nullable: true,
                      type: "object",
                      properties: {
                        label: {
                          type: "string",
                          description: "The human-readable name the user gave this commitment when they created it (e.g. \"rent\").",
                          example: "rent",
                        },
                        amount: {
                          type: "string",
                          description: "The size of this specific blocking commitment, in ETH, as a decimal string.",
                          example: "0.006",
                        },
                        unlockDate: {
                          type: "string",
                          description:
                            "The date this commitment unlocks and stops blocking spending, as a " +
                            "human-readable string (e.g. \"2 Dec 2026\") — not a Unix timestamp. Use this " +
                            "to tell the user when the amount they asked about would become spendable.",
                          example: "2 Dec 2026",
                        },
                      },
                    },
                    upcomingObligations: {
                      type: "array",
                      description:
                        "Every commitment on this wallet that has not yet been released, ordered soonest " +
                        "unlock date first. This is descriptive context sourced from an indexed Subgraph " +
                        "(not the live contract), so it can lag the latest block slightly — check the " +
                        "`sources.upcomingObligations` field to see if it was available for this response. " +
                        "Use this list to explain the user's overall picture of held funds, not to compute " +
                        "the verdict for the requested amount (use `allowed` for that).",
                      items: {
                        type: "object",
                        required: ["commitmentId", "label", "amount", "amountWei", "unlockDate", "unlockTimestamp", "transactionHash"],
                        properties: {
                          commitmentId: {
                            type: "string",
                            description: "The on-chain index of this commitment on the Levee contract.",
                            example: "4",
                          },
                          label: {
                            type: "string",
                            description: "The human-readable name the user gave this commitment.",
                            example: "Exams",
                          },
                          amount: {
                            type: "string",
                            description: "The committed amount, in ETH, as a decimal string.",
                            example: "0.006",
                          },
                          amountWei: {
                            type: "string",
                            description: "The same committed amount, in wei, as a decimal string — for precise arithmetic without floating-point rounding.",
                            example: "6000000000000000",
                          },
                          unlockDate: {
                            type: "string",
                            description: "The unlock date as a human-readable string (e.g. \"25 Sept 2026\").",
                            example: "25 Sept 2026",
                          },
                          unlockTimestamp: {
                            type: "number",
                            description: "The unlock date as a Unix timestamp in seconds, for sorting or date-math.",
                            example: 1790274600,
                          },
                          transactionHash: {
                            type: "string",
                            description: "The transaction hash of the commit() call that created this commitment, for reference on a block explorer.",
                            example: "0x1daefc423273c92ac8512ea73bea29acea11ac727d1211a95d24137273f181a8",
                          },
                        },
                      },
                    },
                    reasoning: {
                      type: "string",
                      description:
                        "One plain-text sentence explaining the verdict — why the amount is or isn't " +
                        "spendable right now. Safe to show directly to an end user as-is; it never " +
                        "contains Markdown or internal implementation detail.",
                      example: "0.003 ETH cannot be spent because it is blocked by the \"rent\" hold until 2 Dec 2026.",
                    },
                    sources: {
                      type: "object",
                      description:
                        "Explains where each part of this response came from, so you can correctly " +
                        "represent its freshness and reliability to the user.",
                      required: ["verdict", "upcomingObligations"],
                      properties: {
                        verdict: {
                          type: "string",
                          description: "Always describes the verdict (allowed, freeBalance, blockingCommitment) as a live on-chain read — this part is never stale.",
                          example: "Live on-chain read (canSpend + freeBalance via the Levee contract).",
                        },
                        upcomingObligations: {
                          type: "string",
                          description:
                            "Describes whether the Subgraph was reachable for this request. If it was " +
                            "unavailable, `upcomingObligations` above will be an empty array even if the " +
                            "wallet actually has holds — the verdict is unaffected either way, but do not " +
                            "tell the user they have no obligations based on an empty list alone without " +
                            "checking this field first.",
                          example: "The Graph subgraph — indexed Committed/Released events, may lag the latest block slightly.",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": {
            description:
              "The request was malformed — `wallet` is missing or not a valid address, or `amount` is " +
              "missing or not a plain positive decimal number. Fix the input and retry; this is not a " +
              "transient failure.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["error"],
                  properties: {
                    error: {
                      type: "string",
                      description: "A human-readable description of what was wrong with the request.",
                      example: 'amount must be a plain positive decimal ETH value, e.g. "0.003".',
                    },
                  },
                },
              },
            },
          },
          "502": {
            description:
              "The request was well-formed, but computing the verdict failed — most likely an RPC or " +
              "Subgraph error upstream. Safe to retry after a short delay.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["error"],
                  properties: {
                    error: {
                      type: "string",
                      description: "A human-readable description of the failure.",
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

export async function GET() {
  return Response.json(OPENAPI_SPEC);
}
