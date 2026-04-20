import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? ""

  const response = await fetch("http://localhost:3001/proyectos/mine", {
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
