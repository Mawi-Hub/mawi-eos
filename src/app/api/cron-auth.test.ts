import test from "node:test";
import assert from "node:assert/strict";

// Los cuatro endpoints de cron rechazan sin Authorization válido y NO tocan la
// base ni Slack (el guard corre antes de cualquier otra cosa).
test("los crons fallan cerrado sin CRON_SECRET o con Bearer incorrecto", async () => {
  const prev = process.env.CRON_SECRET;
  const routes = [
    () => import("./l10/cron/route"),
    () => import("./l10/digest/route"),
    () => import("./checkin/kpi/route"),
    () => import("./checkin/digest/route"),
  ];
  for (const load of routes) {
    const { GET } = await load();
    delete process.env.CRON_SECRET;
    assert.equal((await GET(new Request("http://x/api"))).status, 401, "sin secreto configurado");
    process.env.CRON_SECRET = "abc";
    assert.equal((await GET(new Request("http://x/api", { headers: { authorization: "Bearer mal" } }))).status, 401);
    assert.equal((await GET(new Request("http://x/api"))).status, 401);
  }
  if (prev === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = prev;
});
