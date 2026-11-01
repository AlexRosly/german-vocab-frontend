import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiClient, ApiError } from "../src/lib/api-client.ts";

const baseUrl = "http://api.test/api/v1";
const user = (id = "user-a") => ({ id, email: `${id}@example.com`, emailVerified: null, role: "USER", interfaceLanguage: "ru", translationLanguage: "ru" });
const auth = (token = "a", id = "user-a") => Response.json({ accessToken: token.repeat(43), user: user(id) });
const status = (code) => Response.json({ message: "request failed" }, { status: code });
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const tokenOf = (init) => new Headers(init.headers).get("Authorization");

test("translation preferences persist independently and cannot replace identity or role", async () => {
  let preferenceCalls = 0;
  const client = new ApiClient({ baseUrl, fetch: async (url, init) => {
    if (url.endsWith("/auth/login")) return auth();
    assert.equal(url, `${baseUrl}/users/me/preferences`);
    assert.equal(init.method, "PATCH");
    assert.deepEqual(JSON.parse(init.body), { translationLanguage: "en" });
    assert.equal(tokenOf(init), `Bearer ${"a".repeat(43)}`);
    preferenceCalls++;
    return Response.json({ interfaceLanguage: "ru", translationLanguage: "en", id: "attacker", role: "ADMIN" });
  } });
  await client.signIn("a@example.com", "password");
  await client.updateTranslationLanguage("en");
  assert.deepEqual(client.getSnapshot().user, { ...user(), translationLanguage: "en" });
  assert.equal(preferenceCalls, 1);
});

test("failed or malformed preference responses preserve the current account and language", async () => {
  for (const result of [() => status(500), () => Response.json({ translationLanguage: "en" })]) {
    let writes = 0;
    const client = new ApiClient({ baseUrl, fetch: async (url) => {
      if (url.endsWith("/auth/login")) return auth();
      writes++; return result();
    } });
    await client.signIn("a@example.com", "password");
    await assert.rejects(client.updateTranslationLanguage("en"), ApiError);
    assert.deepEqual(client.getSnapshot().user, user());
    assert.equal(writes, 1);
  }
});

test("a delayed preference body cannot change a different logged-in account", async () => {
  const body = deferred(); let logins = 0;
  const client = new ApiClient({ baseUrl, fetch: async (url) => {
    if (url.endsWith("/auth/login")) return auth(++logins === 1 ? "a" : "b", logins === 1 ? "user-a" : "user-b");
    return { ok: true, json: () => body.promise };
  } });
  await client.signIn("a@example.com", "password");
  const update = client.updateTranslationLanguage("en");
  await new Promise((resolve) => setImmediate(resolve));
  await client.signIn("b@example.com", "password");
  body.resolve({ interfaceLanguage: "de", translationLanguage: "en" });
  await assert.rejects(update, (error) => error.status === 401);
  assert.deepEqual(client.getSnapshot().user, user("user-b"));
});

test("a refresh started before a preference save cannot restore the old language", async () => {
  const refresh = deferred(); let refreshStarted = false;
  const client = new ApiClient({ baseUrl, fetch: async (url, init) => {
    if (url.endsWith("/auth/login")) return auth();
    if (url.endsWith("/auth/refresh")) { refreshStarted = true; return refresh.promise; }
    if (url.endsWith("/users/me/preferences")) return Response.json({ interfaceLanguage: "ru", translationLanguage: "en" });
    return tokenOf(init) === `Bearer ${"a".repeat(43)}` ? status(401) : Response.json({ ok: true });
  } });
  await client.signIn("a@example.com", "password");
  const request = client.request("/words/mine");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(refreshStarted, true);
  await client.updateTranslationLanguage("en");
  refresh.resolve(auth("b"));
  assert.equal((await request).status, 200);
  assert.equal(client.getSnapshot().user.translationLanguage, "en");
});

test("restores a cookie session once for simultaneous callers", async () => {
  const gate = deferred(); let calls = 0;
  const client = new ApiClient({ baseUrl, fetch: async (url, init) => {
    calls += 1;
    assert.equal(url, `${baseUrl}/auth/refresh`);
    assert.equal(init.credentials, "include"); assert.equal(init.cache, "no-store");
    assert.equal(tokenOf(init), null);
    await gate.promise; return auth();
  } });
  const first = client.restoreSession(); const second = client.restoreSession();
  gate.resolve();
  assert.deepEqual(await first, user()); assert.deepEqual(await second, user());
  assert.equal(calls, 1); assert.equal(client.getSnapshot().user.id, "user-a");
});

test("uses login/register endpoints, preserves passwords and attaches bearer headers", async () => {
  const calls = []; let mutations = 0;
  const client = new ApiClient({ baseUrl, onAuthMutation: () => mutations++, fetch: async (url, init) => {
    calls.push({ url, init }); return url.includes("/auth/") ? auth() : Response.json({ ok: true });
  } });
  const password = "  A password 123!  ";
  await client.signIn(" learner@example.com ", password);
  await client.request("/words/mine", { headers: { "Idempotency-Key": "key-0001" } });
  await client.register("next@example.com", password);
  assert.deepEqual(JSON.parse(calls[0].init.body), { email: "learner@example.com", password });
  assert.equal(calls[1].url, `${baseUrl}/words/mine`);
  assert.equal(tokenOf(calls[1].init), `Bearer ${"a".repeat(43)}`);
  assert.equal(new Headers(calls[1].init.headers).get("Idempotency-Key"), "key-0001");
  assert.equal(calls[2].url, `${baseUrl}/auth/register`); assert.equal(mutations, 2);
});

test("shares a refresh between parallel 401s and retries each request once", async () => {
  let refreshes = 0; let resourceCalls = 0; const gate = deferred();
  const client = new ApiClient({ baseUrl, fetch: async (url, init) => {
    if (url.endsWith("/auth/login")) return auth();
    if (url.endsWith("/auth/refresh")) { refreshes++; await gate.promise; return auth("b"); }
    resourceCalls++;
    return tokenOf(init) === `Bearer ${"a".repeat(43)}` ? status(401) : Response.json({ ok: true });
  } });
  await client.signIn("a@example.com", "password");
  const first = client.request("/words/mine"); const second = client.request("/study/due");
  await new Promise((resolve) => setImmediate(resolve)); gate.resolve();
  assert.equal((await first).status, 200); assert.equal((await second).status, 200);
  assert.equal(refreshes, 1); assert.equal(resourceCalls, 4);
});

test("a late 401 reuses an already refreshed token rather than rotating again", async () => {
  const late = deferred(); let refreshes = 0;
  const client = new ApiClient({ baseUrl, fetch: async (url, init) => {
    if (url.endsWith("/auth/login")) return auth();
    if (url.endsWith("/auth/refresh")) { refreshes++; return auth("b"); }
    if (tokenOf(init) === `Bearer ${"b".repeat(43)}`) return Response.json({ ok: true });
    return url.endsWith("/slow") ? late.promise : status(401);
  } });
  await client.signIn("a@example.com", "password");
  const slow = client.request("/slow");
  assert.equal((await client.request("/fast")).status, 200);
  late.resolve(status(401)); assert.equal((await slow).status, 200); assert.equal(refreshes, 1);
});

test("expired refresh clears the account and prevents an infinite retry", async () => {
  let refreshes = 0; let resources = 0;
  const client = new ApiClient({ baseUrl, fetch: async (url) => {
    if (url.endsWith("/auth/login")) return auth();
    if (url.endsWith("/auth/refresh")) { refreshes++; return status(401); }
    resources++; return status(401);
  } });
  await client.signIn("a@example.com", "password");
  await assert.rejects(client.request("/words/mine"), (error) => error instanceof ApiError && error.status === 401);
  assert.deepEqual(client.getSnapshot(), { ready: true, user: null });
  assert.equal(refreshes, 1); assert.equal(resources, 1);
});

test("a second protected 401 after successful refresh clears the session", async () => {
  let refreshes = 0; let resources = 0;
  const client = new ApiClient({ baseUrl, fetch: async (url) => {
    if (url.endsWith("/auth/login")) return auth();
    if (url.endsWith("/auth/refresh")) { refreshes++; return auth("b"); }
    resources++; return status(401);
  } });
  await client.signIn("a@example.com", "password");
  await assert.rejects(client.request("/words/mine"));
  assert.equal(refreshes, 1); assert.equal(resources, 2); assert.equal(client.getSnapshot().user, null);
});

test("temporary refresh failures keep the account and can be retried", async () => {
  let refreshes = 0;
  const client = new ApiClient({ baseUrl, fetch: async (url, init) => {
    if (url.endsWith("/auth/login")) return auth();
    if (url.endsWith("/auth/refresh")) { refreshes++; return refreshes === 1 ? status(503) : auth("b"); }
    return tokenOf(init) === `Bearer ${"b".repeat(43)}` ? Response.json({ ok: true }) : status(401);
  } });
  await client.signIn("a@example.com", "password");
  await assert.rejects(client.request("/words/mine"), (error) => error.status === 503);
  assert.equal(client.getSnapshot().user.id, "user-a");
  assert.equal((await client.request("/words/mine")).status, 200); assert.equal(refreshes, 2);
});

test("network failure is recoverable without authenticating an unknown session", async () => {
  const client = new ApiClient({ baseUrl, fetch: async () => { throw new TypeError("network unavailable"); } });
  await assert.rejects(client.restoreSession(), (error) => error.status === 0);
  assert.equal(client.getSnapshot().ready, false); assert.equal(client.getSnapshot().user, null);
});

test("logout waits for a refresh and the late refresh cannot restore the account", async () => {
  const gate = deferred(); const events = [];
  const client = new ApiClient({ baseUrl, fetch: async (url) => {
    if (url.endsWith("/auth/login")) return auth();
    if (url.endsWith("/auth/refresh")) { events.push("refresh"); await gate.promise; events.push("refreshed"); return auth("b"); }
    if (url.endsWith("/auth/logout")) { events.push("logout"); return new Response(null, { status: 204 }); }
    return status(401);
  } });
  await client.signIn("a@example.com", "password");
  const request = client.request("/words/mine"); const failed = assert.rejects(request);
  await new Promise((resolve) => setImmediate(resolve));
  const logout = client.logout(); const repeatedLogout = client.logout();
  gate.resolve(); await logout; await repeatedLogout; await failed;
  assert.deepEqual(events, ["refresh", "refreshed", "logout"]); assert.equal(client.getSnapshot().user, null);
});

test("a failed logout is reported and keeps the account until server logout succeeds", async () => {
  let attempts = 0;
  const client = new ApiClient({ baseUrl, fetch: async (url) => {
    if (url.endsWith("/auth/login")) return auth();
    attempts++; return attempts === 1 ? status(503) : new Response(null, { status: 204 });
  } });
  await client.signIn("a@example.com", "password");
  await assert.rejects(client.logout()); assert.equal(client.getSnapshot().user.id, "user-a");
  await client.logout(); assert.equal(client.getSnapshot().user, null);
});

test("responses from a previous account are discarded after switching accounts", async () => {
  const late = deferred(); let logins = 0;
  const client = new ApiClient({ baseUrl, fetch: async (url) => {
    if (url.endsWith("/auth/login")) { logins++; return logins === 1 ? auth("a", "user-a") : auth("b", "user-b"); }
    return late.promise;
  } });
  await client.signIn("a@example.com", "password");
  const old = client.request("/words/mine"); const rejected = assert.rejects(old);
  await client.signIn("b@example.com", "password"); late.resolve(Response.json({ private: "old user" }));
  await rejected; assert.equal(client.getSnapshot().user.id, "user-b");
});

test("an initial refresh cannot overwrite a later login", async () => {
  const gate = deferred();
  const client = new ApiClient({ baseUrl, fetch: async (url) => {
    if (url.endsWith("/auth/refresh")) { await gate.promise; return auth("a", "old-user"); }
    return auth("b", "new-user");
  } });
  const restore = client.restoreSession();
  await new Promise((resolve) => setImmediate(resolve));
  const login = client.signIn("new@example.com", "password");
  gate.resolve(); await restore; await login;
  assert.equal(client.getSnapshot().user.id, "new-user");
});

test("only relative API paths are allowed before sending credentials", async () => {
  let calls = 0; const client = new ApiClient({ baseUrl, fetch: async () => { calls++; return auth(); } });
  await assert.rejects(client.request("https://untrusted.test"));
  await assert.rejects(client.request("//untrusted.test")); assert.equal(calls, 0);
});

test("retains the exact body and Idempotency-Key on an authenticated retry", async () => {
  const bodies = []; const keys = [];
  const client = new ApiClient({ baseUrl, fetch: async (url, init) => {
    if (url.endsWith("/auth/login")) return auth();
    if (url.endsWith("/auth/refresh")) return auth("b");
    bodies.push(init.body); keys.push(new Headers(init.headers).get("Idempotency-Key"));
    return bodies.length === 1 ? status(401) : Response.json({ ok: true });
  } });
  await client.signIn("a@example.com", "password");
  await client.request("/study/sessions", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": "session-0001" }, body: JSON.stringify({ words: ["one"] }) });
  assert.equal(bodies[0], bodies[1]); assert.deepEqual(keys, ["session-0001", "session-0001"]);
});

test("does not automatically repeat failed mutations for HTTP 500", async () => {
  let writes = 0;
  const client = new ApiClient({ baseUrl, fetch: async (url) => {
    if (url.endsWith("/auth/login")) return auth();
    writes++; return status(500);
  } });
  await client.signIn("a@example.com", "password");
  assert.equal((await client.request("/words", { method: "POST", body: "{}" })).status, 500);
  assert.equal(writes, 1);
});

test("rejects a malformed auth response and renders no authenticated account", async () => {
  const client = new ApiClient({ baseUrl, fetch: async () => Response.json({ accessToken: "bad", user: user() }) });
  await assert.rejects(client.signIn("a@example.com", "password"), (error) => error.status === 502);
  assert.equal(client.getSnapshot().user, null);
});

test("snapshots are stable between events and unsubscribing stops notifications", async () => {
  const client = new ApiClient({ baseUrl, fetch: async () => auth() });
  assert.equal(client.getSnapshot(), client.getSnapshot());
  let events = 0; const unsubscribe = client.subscribe(() => events++);
  await client.signIn("a@example.com", "password"); assert.equal(events, 2);
  unsubscribe(); client.invalidateSession(); assert.equal(events, 2);
});

test("uses the supplied cross-tab lock for every auth request", async () => {
  let locks = 0;
  const client = new ApiClient({ baseUrl, authLock: async (work) => { locks++; return work(); }, fetch: async (url) => url.endsWith("/auth/logout") ? new Response(null, { status: 204 }) : auth() });
  await client.restoreSession(); await client.signIn("a@example.com", "password"); await client.logout();
  assert.equal(locks, 3);
});
