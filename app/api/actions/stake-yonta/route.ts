// file: app/api/actions/stake-yonta/route.ts

import {
  ActionGetResponse,
  ActionPostRequest,
  ActionPostResponse,
  ACTIONS_CORS_HEADERS,
  BLOCKCHAIN_IDS,
} from "@solana/actions";

import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

// ---------- CONFIG ----------

// Solana mainnet RPC – swap for your own RPC if you want
const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");

// CAIP-2 chain id for Solana mainnet
const blockchain = BLOCKCHAIN_IDS.mainnet;

// Your vote account (Yonta Labs validator)
const YONTA_VOTE_ACCOUNT = new PublicKey(
  "BeSov1og3sEYyH9JY3ap7QcQDvVX8f4sugfNPf9YLkcV"
);

// Standard headers for Actions/Blinks, per Dialect/Solana docs
// ACTIONS_CORS_HEADERS includes the correct CORS + OPTIONS behavior.
// We just add metadata headers on top.
const headers = {
  ...ACTIONS_CORS_HEADERS,
  "X-Blockchain-Ids": blockchain,
  "X-Action-Version": "2.4", // spec version – any valid string is fine
};

// ---------- OPTIONS (CORS preflight) ----------
// Dialect’s validator *requires* this to be present and to use the same headers.
export const OPTIONS = async () => {
  return new Response(null, { headers });
};

// ---------- GET (metadata / UI config) ----------

export const GET = async (req: Request) => {
  const url = new URL(req.url);

  const response: ActionGetResponse = {
    type: "action",
    title: "Stake with Yonta Labs",
    label: "Stake SOL",
    description:
      "Stake SOL with the Yonta Labs validator (0% commission, Jito MEV rewards).",
    // For now reuse Next logo so the schema is valid. You can change this to a Yonta image later.
    icon: new URL("/next.svg", url).toString(),
    links: {
      actions: [
        {
          type: "transaction",
          label: "Stake 1 SOL",
          href: "/api/actions/stake-yonta?amount=1",
        },
        {
          type: "transaction",
          label: "Stake 5 SOL",
          href: "/api/actions/stake-yonta?amount=5",
        },
        {
          type: "transaction",
          label: "Custom amount",
          href: "/api/actions/stake-yonta?amount={amount}",
          parameters: [
            {
              name: "amount",
              label: "SOL amount",
              type: "number",
              min: 0.01,
            },
          ],
        },
      ],
    },
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers,
  });
};

// ---------- POST (build the transaction) ----------
// NOTE: For now this creates a simple SOL transfer to your vote account.
// Once Dialect is happy with CORS/spec, we can evolve this into a proper
// stake-account + delegate flow.

export const POST = async (req: Request) => {
  try {
    const url = new URL(req.url);

    // Amount in SOL from querystring
    const rawAmount = url.searchParams.get("amount") ?? "1";
    const amount = Number(rawAmount);

    if (!amount || !Number.isFinite(amount) || amount <= 0) {
      return new Response(
        JSON.stringify({ error: "Invalid amount parameter" }),
        { status: 400, headers }
      );
    }

    // Body is the ActionPostRequest from the wallet / Blink client
    const body: ActionPostRequest = await req.json();
    const payer = new PublicKey(body.account);

    const lamports = Math.round(amount * LAMPORTS_PER_SOL);

    // Simple SOL transfer tx to your vote account
    const ix = SystemProgram.transfer({
      fromPubkey: payer,
      toPubkey: YONTA_VOTE_ACCOUNT,
      lamports,
    });

    const { blockhash } = await connection.getLatestBlockhash("finalized");

    const message = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockhash,
      instructions: [ix],
    }).compileToV0Message();

    const tx = new VersionedTransaction(message);

    const actionResponse: ActionPostResponse = {
      type: "transaction",
      transaction: Buffer.from(tx.serialize()).toString("base64"),
    };

    return new Response(JSON.stringify(actionResponse), {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("Error building stake-yonta transaction:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers }
    );
  }
};
