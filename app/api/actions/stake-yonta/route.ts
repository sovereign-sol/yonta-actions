// app/api/actions/stake-yonta/route.ts

import {
  Authorized,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  Lockup,
  PublicKey,
  StakeProgram,
  Transaction,
} from "@solana/web3.js";
import { Buffer } from "buffer";

// You can swap this later for your preferred RPC
const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const connection = new Connection(RPC_URL, "confirmed");

// Yonta Labs validator vote account
const YONTA_VOTE_PUBKEY = new PublicKey(
  "BeSov1og3sEYyH9JY3ap7QcQDvVX8f4sugfNPf9YLkcV",
);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS,POST",
  "Access-Control-Allow-Headers": "Content-Type",
};

// GET = describe the Action / Blink metadata
export async function GET(req: Request) {
  const url = new URL(req.url);

  const payload = {
    type: "action",
    title: "Stake with Yonta Labs",
    description:
      "Stake SOL directly to the Yonta Labs validator (0% commission, Jito MEV).",
    label: "Stake SOL",
    // Simple buttons for wallets / Blink UIs
    links: {
      actions: [
        {
          type: "transaction",
          label: "Stake 1 SOL",
          href: `${url.origin}/api/actions/stake-yonta?amount=1`,
        },
        {
          type: "transaction",
          label: "Stake 5 SOL",
          href: `${url.origin}/api/actions/stake-yonta?amount=5`,
        },
        {
          type: "transaction",
          label: "Custom amount",
          href: `${url.origin}/api/actions/stake-yonta?amount={amount}`,
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

  return new Response(JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

// OPTIONS = CORS preflight
export async function OPTIONS() {
  return new Response(null, {
    headers: {
      ...CORS_HEADERS,
    },
  });
}

// Helper: build a stake + delegate transaction
async function buildStakeTx(params: {
  staker: PublicKey;
  votePubkey: PublicKey;
  solAmount: number;
}) {
  const { staker, votePubkey, solAmount } = params;

  if (!Number.isFinite(solAmount) || solAmount <= 0) {
    throw new Error("Amount must be greater than 0");
  }

  const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);

  // New stake account keypair (only used to create the account)
  const stakeAccount = Keypair.generate();

  const authorized = new Authorized(staker, staker);
  const lockup = new Lockup(0, 0, staker);

  const createStakeIx = StakeProgram.createAccount({
    fromPubkey: staker,
    stakePubkey: stakeAccount.publicKey,
    authorized,
    lockup,
    lamports,
  });

  const delegateIx = StakeProgram.delegate({
    stakePubkey: stakeAccount.publicKey,
    authorizedPubkey: staker,
    votePubkey,
  });

  const { blockhash } = await connection.getLatestBlockhash("finalized");

  const tx = new Transaction().add(createStakeIx, delegateIx);
  tx.feePayer = staker;
  tx.recentBlockhash = blockhash;

  // Server partially signs with the new stake account
  tx.partialSign(stakeAccount);

  return tx;
}

// POST = wallet calls this to get the transaction to sign
export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const rawAmount = url.searchParams.get("amount") ?? "1";
    const solAmount = Number(rawAmount);

    if (!Number.isFinite(solAmount) || solAmount <= 0) {
      return new Response(
        JSON.stringify({ error: "Invalid amount" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
          },
        },
      );
    }

    const body = await req.json().catch(() => null) as { account?: string } | null;

    if (!body?.account) {
      return new Response(
        JSON.stringify({ error: "Missing account in request body" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
          },
        },
      );
    }

    const staker = new PublicKey(body.account);

    const tx = await buildStakeTx({
      staker,
      votePubkey: YONTA_VOTE_PUBKEY,
      solAmount,
    });

    const serialized = tx.serialize({
      requireAllSignatures: false,
    });
    const b64 = Buffer.from(serialized).toString("base64");

    const responseBody = {
      transaction: b64,
      message: `Stake ~${solAmount} SOL with Yonta Labs validator`,
    };

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS,
      },
    });
  } catch (err) {
    console.error("Error in stake-yonta POST:", err);
    return new Response(
      JSON.stringify({ error: "Failed to build stake transaction" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS,
        },
      },
    );
  }
}
