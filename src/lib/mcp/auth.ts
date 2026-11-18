import crypto from "crypto";

// Guard del endpoint MCP. Falla cerrado: sin MCP_TOKEN configurado, o con un
// token distinto, no autoriza. El token llega como `Authorization: Bearer …`
// (Claude Code y clientes que permiten headers) o como `?token=…` en la URL
// (conectores que solo aceptan una URL). El endpoint está fuera del middleware
// de sesión, así que este es su único control.
export function checkMcpAuth(request: Request): boolean {
  const secret = process.env.MCP_TOKEN;
  if (!secret) return false;

  const header = request.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const query = new URL(request.url).searchParams.get("token");
  const received = bearer ?? query;
  if (!received) return false;

  // Se comparan digests para no filtrar el largo del secreto.
  const a = crypto.createHash("sha256").update(secret).digest();
  const b = crypto.createHash("sha256").update(received).digest();
  return crypto.timingSafeEqual(a, b);
}
