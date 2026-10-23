// Llamada mínima a Claude que devuelve JSON (o null si falla o no hay clave).

export async function claudeJson(prompt: string, maxTokens = 1800): Promise<unknown> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = (data.content?.find((b) => b.type === "text")?.text ?? "").trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
    return JSON.parse(text);
  } catch {
    return null;
  }
}
