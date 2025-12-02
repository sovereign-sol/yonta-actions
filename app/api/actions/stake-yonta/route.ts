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

// Solana mainnet RPC – you can swap for your own endpoint
const connection = new Connection(
  "https://api.mainnet-beta.solana.com",
  "confirmed"
);

// CAIP-2 chain id for Solana mainnet
const blockchain = BLOCKCHAIN_IDS.mainnet;

// Yonta Labs vote account
const YONTA_VOTE_ACCOUNT = new PublicKey(
  "BeSov1og3sEYyH9JY3ap7QcQDvVX8f4sugfNPf9YLkcV"
);

// Standard headers for Actions/Blinks
const headers = {
  ...ACTIONS_CORS_HEADERS,
  "X-Blockchain-Ids": blockchain,
  "X-Action-Version": "2.4",
};

// ---------- OPTIONS (CORS preflight) ----------

export const OPTIONS = async () => {
  return new Response(null, { headers });
};

// ---------- GET (metadata / UI config) ----------

export const GET = async (req: Request) => {
  const url = new URL(req.url);
  const origin = url.origin;

  const response: ActionGetResponse = {
    type: "action",
    title: "Stake with Yonta Labs",
    label: "Stake with Yonta",
    description:
      "Delegate your SOL directly to the Yonta Labs validator: 0% commission, Jito MEV rewards, independent and veteran-owned, community-first Solana infrastructure.",
    icon: new URL("/yonta-logo.png", origin).toString(),
    links: {
      actions: [
        {
          type: "transaction",
          label: "Stake 1 SOL",
          href: `${origin}/api/actions/stake-yonta?amount=1`,
        },
        {
          type: "transaction",
          label: "Stake 5 SOL",
          href: `${origin}/api/actions/stake-yonta?amount=5`,
        },
        {
          type: "transaction",
          label: "Choose amount",
          href: `${origin}/api/actions/stake-yonta?amount={amount}`,
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

// ---------- HELPER: build REAL stake transaction ----------

async function buildStakeTransaction(payer: PublicKey, amountSol: number) {
  if (!Number.isFinite(amountSol) || amountSol <= 0) {
    throw new Error("Invalid SOL amount");
  }

  // Rent-exempt minimum for a stake account
  const rentExempt = await connection.getMinimumBalanceForRentExemption(
    StakeProgram.space
  );

  // Total lamports = rent + user stake amount
  const lamports = rentExempt + Math.round(amountSol * LAMPORTS_PER_SOL);

  // Seed for deterministic stake account – unique enough per request
  const seed = `yonta-${Date.now().toString()}`;

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
  });

  const { blockhash } = await connection.getLatestBlockhash();

  const tx = new Transaction().add(createIx, initIx, delegateIx);
  tx.feePayer = payer;
  tx.recentBlockhash = blockhash;

  return tx;
}

// ---------- POST (build REAL stake tx for the wallet) ----------

export const POST = async (req: Request) => {
  try {
    const url = new URL(req.url);

    // Amount in SOL from querystring (default: 1 SOL)
    const rawAmount = url.searchParams.get("amount") ?? "1";
    const amount = Number(rawAmount);

    if (!amount || !Number.isFinite(amount) || amount <= 0) {
      return new Response(
        JSON.stringify({ error: "Invalid amount parameter" }),
        { status: 400, headers }
      );
    }

    let body: ActionPostRequest;
    try {
      body = (await req.json()) as ActionPostRequest;
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers }
      );
    }

    if (!body.account) {
      return new Response(
        JSON.stringify({ error: "Missing wallet account" }),
        { status: 400, headers }
      );
    }

    const payer = new PublicKey(body.account);

    const tx = await buildStakeTransaction(payer, amount);

    // IMPORTANT: serialize without requiring signatures (wallet will sign)
    const serializedTx = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    const actionResponse: ActionPostResponse = {
      type: "transaction",
      transaction: Buffer.from(serializedTx).toString("base64"),
      message: `Stake ${amount} SOL with Yonta Labs (0% commission, Jito MEV).`,
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
