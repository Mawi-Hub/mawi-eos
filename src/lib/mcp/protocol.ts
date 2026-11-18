// Servidor MCP mínimo (JSON-RPC 2.0 sobre HTTP, sin estado). Implementa lo que
// necesita un cliente de solo lectura: initialize, ping, tools/list y
// tools/call. Sin SDK: el protocolo es chico y así no depende de la sesión ni
// de SSE, que no encajan con funciones serverless.

export type JsonSchema = Record<string, unknown>;

export type McpTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: JsonSchema;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
};

// Error de uso (argumento inválido, persona inexistente…). Se devuelve al
// modelo como resultado con isError para que corrija la llamada.
export class ToolInputError extends Error {}

export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

export type ServerInfo = { name: string; version: string; instructions?: string };

type RpcResponse = { jsonrpc: "2.0"; id: string | number | null } & (
  | { result: unknown }
  | { error: { code: number; message: string } }
);

function rpcError(id: string | number | null, code: number, message: string): RpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

// null = notificación (sin respuesta).
export async function handleRpc(message: unknown, tools: McpTool[], server: ServerInfo): Promise<RpcResponse | null> {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return rpcError(null, -32600, "Invalid Request");
  }
  const msg = message as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
  const hasId = "id" in msg && (typeof msg.id === "string" || typeof msg.id === "number");
  const id = hasId ? (msg.id as string | number) : null;
  if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    // Una respuesta del cliente (result/error sin method) no se contesta.
    return hasId && !("result" in msg || "error" in msg) ? rpcError(id, -32600, "Invalid Request") : null;
  }
  if (!hasId) return null;

  const params = (msg.params && typeof msg.params === "object" ? msg.params : {}) as Record<string, unknown>;

  switch (msg.method) {
    case "initialize": {
      const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0];
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: server.name, version: server.version },
          ...(server.instructions ? { instructions: server.instructions } : {}),
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: tools.map((t) => ({
            name: t.name,
            ...(t.title ? { title: t.title } : {}),
            description: t.description,
            inputSchema: t.inputSchema,
            annotations: { readOnlyHint: true, openWorldHint: false },
          })),
        },
      };
    case "tools/call": {
      const name = params.name;
      const tool = tools.find((t) => t.name === name);
      if (!tool) return rpcError(id, -32602, `Herramienta desconocida: ${String(name)}`);
      const args = (params.arguments && typeof params.arguments === "object" ? params.arguments : {}) as Record<string, unknown>;
      try {
        const data = await tool.handler(args);
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data) }] } };
      } catch (err) {
        const text =
          err instanceof ToolInputError ? err.message : "Error interno al consultar los datos. Revisá los logs del servidor.";
        if (!(err instanceof ToolInputError)) console.error(`[mcp] ${tool.name} falló`, err);
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], isError: true } };
      }
    }
    default:
      return rpcError(id, -32601, `Método no soportado: ${msg.method}`);
  }
}
