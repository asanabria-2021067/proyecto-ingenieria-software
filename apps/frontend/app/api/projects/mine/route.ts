import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const apiBase =
    process.env.API_URL_INTERNAL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3001"
  const authHeader = req.headers.get("authorization") ?? ""
  const response = await fetch(`${apiBase}/proyectos/mine`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    cache: "no-store",
  })

  const data = await response.json()

  return NextResponse.json(data, {
    status: response.status,
  })
}
