import { test } from "node:test";
import assert from "node:assert/strict";
import { AccountSessionsClient } from "../src/lib/account-sessions-client.ts";
const row = (id = "current", current = true) => ({ id, current, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-02-01T00:00:00.000Z", refreshExpiresAt: "2026-11-08T00:00:00.000Z" });
test("reads only public session metadata through the existing authenticated requester", async () => {
  const controller = new AbortController(); const client = new AccountSessionsClient(async (path, init) => {
    assert.equal(path, "/auth/sessions"); assert.equal(init.signal, controller.signal); assert.equal(init.cache, "no-store");
    return Response.json({ sessions: [{ ...row(), accessTokenHash: "must-not-escape" }, row("other", false)], hasMore: false });
  });
  assert.deepEqual(await client.list(controller.signal), { sessions: [row(), row("other", false)], hasMore: false });
});
test("rejects malformed dates, duplicate sessions and missing or duplicate current markers", async () => {
  for (const sessions of [[], [row("x", false)], [row(), row("other")], [row(), row("current", false)], [{ ...row(), createdAt: "1" }], [{ ...row(), current: 1 }], [null], Array.from({ length: 102 }, (_, i) => row(`id-${i}`, i === 0))]) {
    await assert.rejects(new AccountSessionsClient(async () => Response.json({ sessions, hasMore: false })).list());
  }
});
test("revokes only a validated path identifier and forwards cancellation", async () => {
  const controller = new AbortController(); let calls = 0;
  const client = new AccountSessionsClient(async (path, init) => { calls++; assert.equal(path, "/auth/sessions/other-123"); assert.equal(init.method, "DELETE"); assert.equal(init.signal, controller.signal); return new Response(null, { status: 204 }); });
  await client.revoke("other-123", controller.signal);
  for (const id of ["", "../logout-all", "x/y", "x".repeat(129)]) await assert.rejects(client.revoke(id));
  assert.equal(calls, 1);
});
test("failed and malformed responses never cause an automatic mutation retry", async () => {
  for (const status of [200, 401, 500]) { let calls = 0; const client = new AccountSessionsClient(async () => { calls++; return new Response(null, { status }); }); await assert.rejects(client.revoke("other")); assert.equal(calls, 1); }
  await assert.rejects(new AccountSessionsClient(async () => Response.json({ sessions: [row()] })).list());
});
