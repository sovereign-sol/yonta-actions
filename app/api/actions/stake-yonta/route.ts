// app/api/actions/stake-yonta/route.ts
import { NextResponse } from "next/server";

export const GET = async () => {
  const payload = {
    type: "action",
    title: "Stake with Yonta Labs",
    description: "This will become the Solana Action for staking SOL to Yonta Labs.",
    label: "Stake SOL",
  };

  return NextResponse.json(payload, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS,POST",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
};

export const OPTIONS = async () => {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS,POST",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
};
