// app/api/actions/stake-yonta/route.ts

import {
  ActionGetResponse,
  ActionPostRequest,
  ActionPostResponse,
  ACTIONS_CORS_HEADERS,
  BLOCKCHAIN_IDS,
} from "@solana/actions";

import {
  Authorized,
  Connection,
  LAMPORTS_PER_SOL,
  Lockup,
  PublicKey,
  StakeProgram,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

// ---------- CONFIG ----------

// Solana mainnet RPC – swap for your own RPC if you want
const connection = new Connection(
  "https://api.mainnet-beta.solana.com",
  "confirmed"
);

// CAIP-2 chain id for Solana mainnet
const blockchain = BLOCKCHAIN_IDS.mainnet;

// Your vote account (Yonta Labs validator)
const YONTA_VOTE_ACCOUNT = new PublicKey(
  "BeSov1og3sEYyH9JY3ap7QcQDvVX8f4sugfNPf9YLkcV"
);

// Standard headers for Actions/Blinks
const headers = {
  ...ACTIONS_CORS_HEADERS,
  "X-Blockchain-Ids": blockchain,
  "X-Action-Version": "2.4", // spec version tag (string is fine)
};

// ---------- OPTIONS (CORS preflight) ----------

export const OPTIONS = async () => {
  return new Response(null, { headers });
};

// ---------- GET (metadata / UI config) ----------

export const GET = async (req: Request) => {
  const url = new URL(req.url);

  const response: ActionGetResponse = {
    type: "action",
    title: "Stake with Yonta Labs",
    label: "Stake with Yonta",
    description:
      "Delegate your SOL directly to the Yonta Labs validator: 0% commission, Jito MEV rewards, independent and veteran-owned, community-first Solana infrastructure.",
    icon: new URL("/yonta-logo.png", url).toString(),
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
          label: "Choose amount",
          href: "/api/actions/stake-yonta?amount={amount}",
          parameters: [
            {
              name: "amount",
              label: "SOL to stake",
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

// ---------- HELPER: build REAL stake transaction (legacy tx) ----------

async function buildStakeTransaction(payer: PublicKey, amountSol: number) {
  if (!Number.isFinite(amountSol) || amountSol <= 0) {
    throw new Error("Invalid SOL amount");
  }

  const lamports = Math.round(amountSol * LAMPORTS_PER_SOL);

  // Create a unique seed so each stake account is new
  const seed = `yonta-${Date.now().toString()}`;

  // Deterministic stake account derived from the payer + seed
  const stakePubkey = await PublicKey.createWithSeed(
    payer,
    seed,
    StakeProgram.programId
  );

  // 1) Create the stake account with seed
  const createIx = SystemProgram.createAccountWithSeed({
    fromPubkey: payer,
    newAccountPubkey: stakePubkey,
    basePubkey: payer,
    seed,
    lamports,
    space: StakeProgram.space,
    programId: StakeProgram.programId,
  });

  // 2) Initialize the stake account
  const authorized = new Authorized(payer, payer);
  const lockup = new Lockup(0, 0, payer);

  const initIx = StakeProgram.initialize({
    stakePubkey,
    authorized,
    lockup,
  });

  // 3) Delegate stake to Yonta Labs vote account
  const delegateIx = StakeProgram.delegate({
    stakePubkey,
    authorizedPubkey: payer,
    votePubkey: YONTA_VOTE_ACCOUNT,
  }).instructions[0]; // StakeProgram.delegate returns a Transaction; take the first instruction

  const { blockhash } = await connection.getLatestBlockhash("finalized");

  const tx = new Transaction().add(createIx, initIx, delegateIx);
  tx.feePayer = payer;
  tx.recentBlockhash = blockhash;

  // Only the user's wallet signs this (payer)
  return tx;
}

// ---------- POST (build REAL stake tx for the wallet) ----------

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

    if (!body.account) {
      return new Response(
        JSON.stringify({ error: "Missing wallet account" }),
        { status: 400, headers }
      );
    }

    const payer = new PublicKey(body.account);

    const tx = await buildStakeTransaction(payer, amount);

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
