import { NextResponse } from "next/server";
import { checkMcpAuth } from "@/lib/mcp/auth";
import { handleRpc } from "@/lib/mcp/protocol";
import { eosTools } from "@/lib/mcp/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Servidor MCP de solo lectura sobre los datos de EOS (Streamable HTTP sin
// estado: cada POST trae un mensaje JSON-RPC y recibe la respuesta en JSON).
// Ver docs/mcp.md para conectarlo desde Claude.
const SERVER = {
  name: "mawi-eos",
  version: "1.0.0",
  instructions:
    "Datos del sistema EOS de Mawi (rocks, scorecard, L10, check-ins, plan) en solo lectura. Llamá a la herramienta guia antes de la primera consulta para entender estados y definiciones.",
};

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(request: Request) {
  if (!checkMcpAuth(request)) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }

  if (Array.isArray(body)) {
    const responses = (await Promise.all(body.map((m) => handleRpc(m, eosTools, SERVER)))).filter((r) => r !== null);
    return responses.length ? NextResponse.json(responses) : new Response(null, { status: 202 });
  }
  const response = await handleRpc(body, eosTools, SERVER);
  return response ? NextResponse.json(response) : new Response(null, { status: 202 });
}

// Sin stream de servidor a cliente ni sesiones: GET y DELETE no aplican.
export async function GET(request: Request) {
  if (!checkMcpAuth(request)) return unauthorized();
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}

export async function DELETE(request: Request) {
  if (!checkMcpAuth(request)) return unauthorized();
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
