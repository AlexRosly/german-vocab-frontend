import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiClient, ApiError } from "../src/lib/api-client.ts";
const user = (id = "a") => ({ id, email: `${id}@example.test`, emailVerified: null, role: "USER", interfaceLanguage: "ru", translationLanguage: "en" });
const auth = (id = "a") => Response.json({ accessToken: id.repeat(43), user: user(id) });
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const nextTick = () => new Promise((resolve) => setImmediate(resolve));

test("saving an interface language changes only that preference, never identity, role or translation language", async () => {
  const client = new ApiClient({ baseUrl: "https://api.test", fetch: async (url, init) => {
    if (url.endsWith("/auth/login")) return auth();
    assert.deepEqual(JSON.parse(init.body), { interfaceLanguage: "de" });
    return Response.json({ interfaceLanguage: "de", translationLanguage: "uk", id: "other", role: "ADMIN" });
  } });
  await client.signIn("a@example.test", "password"); await client.updateInterfaceLanguage("de");
  assert.deepEqual(client.getSnapshot().user, { ...user(), interfaceLanguage: "de" });
});

test("parallel UI and card language writes are serialized and preserve both settings", async () => {
  const gate = deferred(); const calls = [];
  const client = new ApiClient({ baseUrl: "https://api.test", fetch: async (url, init) => {
    if (url.endsWith("/auth/login")) return auth();
    calls.push(JSON.parse(init.body));
    if (calls.length === 1) { await gate.promise; return Response.json({ interfaceLanguage: "de", translationLanguage: "en" }); }
    return Response.json({ interfaceLanguage: "de", translationLanguage: "uk" });
  } });
  await client.signIn("a@example.test", "password");
  const first = client.updateInterfaceLanguage("de"); const second = client.updateTranslationLanguage("uk");
  await nextTick(); assert.equal(calls.length, 1); gate.resolve(); await Promise.all([first, second]);
  assert.deepEqual(calls, [{ interfaceLanguage: "de" }, { translationLanguage: "uk" }]);
  assert.deepEqual(client.getSnapshot().user, { ...user(), interfaceLanguage: "de", translationLanguage: "uk" });
});

test("queued language writes cannot run against a newly signed-in account", async () => {
  const gate = deferred(); let logins = 0; let writes = 0;
  const client = new ApiClient({ baseUrl: "https://api.test", fetch: async (url) => {
    if (url.endsWith("/auth/login")) return auth(++logins === 1 ? "a" : "b");
    writes++; await gate.promise; return Response.json({ interfaceLanguage: "de", translationLanguage: "en" });
  } });
  await client.signIn("a@example.test", "password");
  const first = client.updateInterfaceLanguage("de").catch((error) => error);
  const second = client.updateTranslationLanguage("uk").catch((error) => error);
  await nextTick(); await client.signIn("b@example.test", "password"); gate.resolve();
  assert.equal((await first).status, 401); assert.equal((await second).status, 401);
  assert.equal(writes, 1); assert.deepEqual(client.getSnapshot().user, user("b"));
});

test("failed, unsupported or mismatched locale saves preserve preferences and leave the queue usable", async () => {
  let calls = 0;
  const client = new ApiClient({ baseUrl: "https://api.test", fetch: async (url) => {
    if (url.endsWith("/auth/login")) return auth();
    return Response.json({ interfaceLanguage: ++calls === 1 ? "xx" : "de", translationLanguage: "en" });
  } });
  await client.signIn("a@example.test", "password");
  await assert.rejects(client.updateInterfaceLanguage("fr"), ApiError); assert.equal(calls, 0);
  await assert.rejects(client.updateInterfaceLanguage("de"), ApiError); assert.deepEqual(client.getSnapshot().user, user());
  await client.updateInterfaceLanguage("de"); assert.equal(client.getSnapshot().user.interfaceLanguage, "de");
});

test("a refresh begun before a UI language save cannot revert it", async () => {
  const gate = deferred();
  const client = new ApiClient({ baseUrl: "https://api.test", fetch: async (url, init) => {
    if (url.endsWith("/auth/login")) return auth();
    if (url.endsWith("/auth/refresh")) return gate.promise;
    if (url.endsWith("/preferences")) return Response.json({ interfaceLanguage: "de", translationLanguage: "en" });
    return new Headers(init.headers).get("Authorization") === `Bearer ${"a".repeat(43)}` ? new Response(null, { status: 401 }) : Response.json([]);
  } });
  await client.signIn("a@example.test", "password"); const request = client.request("/words/mine");
  await nextTick(); await client.updateInterfaceLanguage("de"); gate.resolve(Response.json({ accessToken: "b".repeat(43), user: user() }));
  await request; assert.deepEqual(client.getSnapshot().user, { ...user(), interfaceLanguage: "de" });
});
