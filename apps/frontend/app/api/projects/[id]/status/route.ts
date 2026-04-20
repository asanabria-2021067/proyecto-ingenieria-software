import { NextRequest, NextResponse } from "next/server"

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const body = await req.json()
  const authHeader = req.headers.get("authorization") ?? ""
  const { id } = await context.params
  const payload = {
    nuevoEstado: body?.nuevoEstado ?? body?.estadoProyecto,
  }

  const response = await fetch(`http://localhost:3001/proyectos/${id}/estado`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify(payload),
  })

  const data = await response.json()

  return NextResponse.json(data, {
    status: response.status,
  })
}
