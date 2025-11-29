// app/actions.json/route.ts
import { NextResponse } from "next/server";

export const GET = async () => {
  const payload = {
    rules: [
      {
        pathPattern: "/stake",
        apiPath: "/api/actions/stake-yonta",
      },
    ],
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
