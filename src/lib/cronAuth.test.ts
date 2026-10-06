import test from "node:test";
import assert from "node:assert/strict";
import { checkCronAuth } from "./cronAuth";

test("sin CRON_SECRET configurado, falla cerrado aunque no se mande nada", () => {
  const prev = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  assert.equal(checkCronAuth(null), false);
  assert.equal(checkCronAuth("Bearer "), false);
  assert.equal(checkCronAuth("Bearer undefined"), false);
  process.env.CRON_SECRET = prev;
});

test("con secreto: solo acepta el Bearer exacto", () => {
  const prev = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "s3cret-de-prueba";
  assert.equal(checkCronAuth("Bearer s3cret-de-prueba"), true);
  assert.equal(checkCronAuth("Bearer otro"), false);
  assert.equal(checkCronAuth("s3cret-de-prueba"), false);
  assert.equal(checkCronAuth(null), false);
  if (prev === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = prev;
});
