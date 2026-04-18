import { NextRequest, NextResponse } from "next/server"

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const authHeader = req.headers.get("authorization") ?? ""

  const response = await fetch("http://localhost:3001/usuarios/me/perfil", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify(body),
  })

  const data = await response.json()

  return NextResponse.json(data, {
    status: response.status,
  })
}
