import { NextRequest, NextResponse } from "next/server"

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const apiBase =
    process.env.API_URL_INTERNAL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3001"

  const authHeader = req.headers.get("authorization") ?? ""
  const { id } = await context.params

  const response = await fetch(`${apiBase}/postulaciones/${id}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
  })

  const data = await response.json().catch(() => ({}))

  return NextResponse.json(data, {
    status: response.status,
  })
}
