/* eslint-disable @typescript-eslint/no-explicit-any -- respuestas JSON-RPC sin tipar en pruebas */
import test from "node:test";
import assert from "node:assert/strict";
import { handleRpc, ToolInputError, type McpTool } from "./protocol";
import { checkMcpAuth } from "./auth";
import { parseQuarter } from "./tools";

const server = { name: "t", version: "0" };
const tools: McpTool[] = [
  { name: "eco", description: "eco", inputSchema: { type: "object" }, handler: async (a) => ({ recibido: a }) },
  {
    name: "malo",
    description: "falla",
    inputSchema: { type: "object" },
    handler: async (a) => {
      if (a.uso) throw new ToolInputError("argumento malo");
      throw new Error("secreto interno");
    },
  },
];

test("initialize negocia la versión y anuncia herramientas", async () => {
  const r = (await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, tools, server)) as any;
  assert.equal(r.result.protocolVersion, "2025-06-18");
  assert.deepEqual(r.result.capabilities, { tools: { listChanged: false } });
  const otra = (await handleRpc({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } }, tools, server)) as any;
  assert.equal(otra.result.protocolVersion, "2025-11-25");
});

test("notificaciones y respuestas del cliente no se contestan", async () => {
  assert.equal(await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, tools, server), null);
  assert.equal(await handleRpc({ jsonrpc: "2.0", id: 3, result: {} }, tools, server), null);
});

test("tools/list marca todo como solo lectura y no expone el handler", async () => {
  const r = (await handleRpc({ jsonrpc: "2.0", id: 4, method: "tools/list" }, tools, server)) as any;
  assert.equal(r.result.tools.length, 2);
  assert.equal(r.result.tools[0].annotations.readOnlyHint, true);
  assert.equal(r.result.tools[0].handler, undefined);
});

test("tools/call devuelve JSON, errores de uso visibles y errores internos ocultos", async () => {
  const ok = (await handleRpc({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "eco", arguments: { x: 1 } } }, tools, server)) as any;
  assert.deepEqual(JSON.parse(ok.result.content[0].text), { recibido: { x: 1 } });

  const uso = (await handleRpc({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "malo", arguments: { uso: true } } }, tools, server)) as any;
  assert.equal(uso.result.isError, true);
  assert.equal(uso.result.content[0].text, "argumento malo");

  const origError = console.error;
  console.error = () => {};
  const interno = (await handleRpc({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "malo" } }, tools, server)) as any;
  console.error = origError;
  assert.equal(interno.result.isError, true);
  assert.doesNotMatch(interno.result.content[0].text, /secreto/);

  const desconocida = (await handleRpc({ jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "nope" } }, tools, server)) as any;
  assert.equal(desconocida.error.code, -32602);
});

test("métodos desconocidos y mensajes inválidos", async () => {
  const r = (await handleRpc({ jsonrpc: "2.0", id: 9, method: "resources/list" }, tools, server)) as any;
  assert.equal(r.error.code, -32601);
  const inv = (await handleRpc("hola", tools, server)) as any;
  assert.equal(inv.error.code, -32600);
});

test("auth falla cerrado y acepta Bearer o ?token=", () => {
  const prev = process.env.MCP_TOKEN;
  delete process.env.MCP_TOKEN;
  assert.equal(checkMcpAuth(new Request("http://x/api/mcp?token=")), false);
  process.env.MCP_TOKEN = "s3creto";
  assert.equal(checkMcpAuth(new Request("http://x/api/mcp")), false);
  assert.equal(checkMcpAuth(new Request("http://x/api/mcp", { headers: { authorization: "Bearer mal" } })), false);
  assert.equal(checkMcpAuth(new Request("http://x/api/mcp?token=mal")), false);
  assert.equal(checkMcpAuth(new Request("http://x/api/mcp", { headers: { authorization: "Bearer s3creto" } })), true);
  assert.equal(checkMcpAuth(new Request("http://x/api/mcp?token=s3creto")), true);
  if (prev === undefined) delete process.env.MCP_TOKEN;
  else process.env.MCP_TOKEN = prev;
});

test("parseQuarter acepta formatos comunes", () => {
  assert.deepEqual(parseQuarter("2026-Q4"), { year: 2026, quarter: 4 });
  assert.deepEqual(parseQuarter("q3 2026"), { year: 2026, quarter: 3 });
  assert.equal(parseQuarter("2026-Q5"), null);
});
