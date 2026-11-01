import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiClient } from "../src/lib/api-client.ts";
const user = (id = "a") => ({ id, email: `${id}@example.test`, emailVerified: null, role: "USER", interfaceLanguage: "de", translationLanguage: "uk" });
const auth = (id = "a", token = "a") => Response.json({ accessToken: token.repeat(43), user: user(id) });
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise((resolve) => setImmediate(resolve));
test("logout-all uses the bearer under the auth lock, shares callers and notifies other tabs after success", async () => {
  const gate = deferred(); let calls = 0; let locks = 0; let events = 0;
  const client = new ApiClient({ baseUrl: "https://api.test", authLock: async (work) => { locks++; return work(); }, onAuthMutation: () => { events++; }, fetch: async (url, init) => {
    if (url.endsWith("/auth/login")) return auth();
    assert.ok(url.endsWith("/auth/logout-all")); assert.equal(init.method, "POST"); assert.equal(new Headers(init.headers).get("Authorization"), `Bearer ${"a".repeat(43)}`); calls++; await gate.promise; return new Response(null, { status: 204 });
  } });
  await client.signIn("a@example.test", "password"); const before = events;
  const first = client.logoutAll(); const second = client.logoutAll(); assert.equal(first, second); await tick();
  await assert.rejects(client.request("/words")); gate.resolve(); await first;
  assert.equal(calls, 1); assert.equal(locks, 2); assert.equal(events, before + 1); assert.equal(client.getSnapshot().user, null);
});
test("failed logout-all keeps the account and can be manually retried without automatic 500 replay", async () => {
  let calls = 0; const client = new ApiClient({ baseUrl: "https://api.test", fetch: async (url) => url.endsWith("/login") ? auth() : (++calls === 1 ? new Response(null, { status: 500 }) : new Response(null, { status: 204 })) });
  await client.signIn("a@example.test", "password"); await assert.rejects(client.logoutAll()); assert.deepEqual(client.getSnapshot().user, user()); assert.equal(calls, 1); await client.logoutAll(); assert.equal(calls, 2); assert.equal(client.getSnapshot().user, null);
});
test("an expired bearer refreshes once inside the same lock before retrying logout-all", async () => {
  const calls = []; let locks = 0;
  const client = new ApiClient({ baseUrl: "https://api.test", authLock: async (work) => { locks++; return work(); }, fetch: async (url, init) => {
    if (url.endsWith("/login")) return auth(); calls.push(url.split("/").at(-1));
    if (url.endsWith("/refresh")) return auth("a", "b");
    return new Response(null, { status: new Headers(init.headers).get("Authorization") === `Bearer ${"b".repeat(43)}` ? 204 : 401 });
  } });
  await client.signIn("a@example.test", "password"); await client.logoutAll(); assert.deepEqual(calls, ["logout-all", "refresh", "logout-all"]); assert.equal(locks, 2); assert.equal(client.getSnapshot().user, null);
});
test("a cookie belonging to another account cannot trigger revocation of that account", async () => {
  let revokes = 0; const client = new ApiClient({ baseUrl: "https://api.test", fetch: async (url) => {
    if (url.endsWith("/login")) return auth(); if (url.endsWith("/refresh")) return auth("b", "b"); revokes++; return new Response(null, { status: 401 });
  } });
  await client.signIn("a@example.test", "password"); await assert.rejects(client.logoutAll()); assert.equal(revokes, 1); assert.equal(client.getSnapshot().user, null);
});
test("a refresh started before logout-all cannot restore the account after revocation", async () => {
  const gate = deferred(); let revokes = 0;
  const client = new ApiClient({ baseUrl: "https://api.test", fetch: async (url) => {
    if (url.endsWith("/login")) return auth(); if (url.endsWith("/refresh")) return gate.promise;
    if (url.endsWith("/logout-all")) { revokes++; return new Response(null, { status: 204 }); }
    return new Response(null, { status: 401 });
  } });
  await client.signIn("a@example.test", "password"); const pending = client.request("/words"); const rejected = assert.rejects(pending); await tick();
  const logout = client.logoutAll(); gate.resolve(auth("a", "b")); await logout; await rejected;
  assert.equal(revokes, 1); assert.equal(client.getSnapshot().user, null);
});
test("a subsequent login is not cleared by an earlier logout-all", async () => {
  const gate = deferred(); let logins = 0;
  const client = new ApiClient({ baseUrl: "https://api.test", fetch: async (url) => { if (url.endsWith("/login")) return auth(++logins === 1 ? "a" : "b"); await gate.promise; return new Response(null, { status: 204 }); } });
  await client.signIn("a@example.test", "password"); const logout = client.logoutAll(); await tick(); const login = client.signIn("b@example.test", "password"); gate.resolve(); await logout; await login; assert.deepEqual(client.getSnapshot().user, user("b"));
});
test("malformed success does not confirm logout, and repeated unauthorized responses end the local session", async () => {
  const client = new ApiClient({ baseUrl: "https://api.test", fetch: async (url) => url.endsWith("/login") ? auth() : new Response(null, { status: 200 }) });
  await client.signIn("a@example.test", "password"); await assert.rejects(client.logoutAll()); assert.deepEqual(client.getSnapshot().user, user());
  let calls = 0;
  const denied = new ApiClient({ baseUrl: "https://api.test", fetch: async (url) => { if (url.endsWith("/login")) return auth(); if (url.endsWith("/refresh")) return auth("a", "b"); calls++; return new Response(null, { status: 401 }); } });
  await denied.signIn("a@example.test", "password"); await assert.rejects(denied.logoutAll()); assert.equal(calls, 2); assert.equal(denied.getSnapshot().user, null);
});
