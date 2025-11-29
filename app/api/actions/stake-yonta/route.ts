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

// --- RPC -----------------------------------------------------
const RPC_URL =
  process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const connection = new Connection(RPC_URL, "confirmed");

// --- YONTA VOTE ACCOUNT --------------------------------------
const YONTA_VOTE_PUBKEY = new PublicKey(
  "BeSov1og3sEYyH9JY3ap7QcQDvVX8f4sugfNPf9YLkcV"
);

// --- HEADERS -------------------------------------------------
// These are used for GET/POST (actual Action responses)
const ACTION_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "X-Action": "true",
  "X-Action-Version": "1",
  // This is what Dialect is complaining about:
  // identify this Action as Solana mainnet
  "X-Blockchain-Ids": "solana:mainnet",
};

// These are used for OPTIONS (CORS preflight only)
const OPTIONS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ==========================
//         GET
// ==========================
export async function GET(req: Request) {
  const url = new URL(req.url);

  const payload = {
    type: "action",
    title: "Stake with Yonta Labs",
    description:
      "Stake SOL to the Yonta Labs validator (0% commission + Jito MEV).",
    label: "Stake SOL",
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
              label: "Enter SOL amount",
              type: "number",
              min: 0.01,
            },
          ],
        },
      ],
    },
  };

  return new Response(JSON.stringify(payload), {
    headers: ACTION_HEADERS,
  });
}

// ==========================
//       OPTIONS
// ==========================
export async function OPTIONS() {
  // Preflight only needs CORS, not Action metadata
  return new Response(null, {
    headers: OPTIONS_HEADERS,
  });
}

// ==========================
//   BUILD STAKE TX HELPER
// ==========================
async function buildStakeTx(params: {
  staker: PublicKey;
  votePubkey: PublicKey;
  solAmount: number;
}) {
  const { staker, votePubkey, solAmount } = params;

  if (!Number.isFinite(solAmount) || solAmount <= 0) {
    throw new Error("Invalid SOL amount");
  }

  const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);

  // New stake account keypair (only used to create the stake account)
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

  // Server signs for the new stake account only
  tx.partialSign(stakeAccount);

  return tx;
}

// ==========================
//         POST
// ==========================
export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const rawAmount = url.searchParams.get("amount") ?? "1";
    const solAmount = Number(rawAmount);

    if (!Number.isFinite(solAmount) || solAmount <= 0) {
      return new Response(
        JSON.stringify({ error: "Invalid stake amount" }),
        { status: 400, headers: ACTION_HEADERS },
      );
    }

    const body = await req.json().catch(() => null) as
      | { account?: string }
      | null;

    if (!body?.account) {
      return new Response(
        JSON.stringify({ error: "Missing wallet account" }),
        { status: 400, headers: ACTION_HEADERS },
      );
    }

    const staker = new PublicKey(body.account);

    const tx = await buildStakeTx({
      staker,
      votePubkey: YONTA_VOTE_PUBKEY,
      solAmount,
    });

    const serialized = tx.serialize({ requireAllSignatures: false });
    const b64 = Buffer.from(serialized).toString("base64");

    return new Response(
      JSON.stringify({
        transaction: b64,
        message: `Stake ~${solAmount} SOL with Yonta Labs`,
      }),
      { status: 200, headers: ACTION_HEADERS },
    );
  } catch (err) {
    console.error("Stake-Yonta ERROR:", err);
    return new Response(
      JSON.stringify({ error: "Internal error building stake transaction" }),
      { status: 500, headers: ACTION_HEADERS },
    );
  }
}
