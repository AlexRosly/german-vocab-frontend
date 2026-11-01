import { test } from "node:test";
import assert from "node:assert/strict";
import { StudySettingsClient, validSettings } from "../src/lib/study-settings-client.ts";
const settings = { timeZone: "Europe/Berlin", dailyGoal: 20 };
test("loads settings without storing returned identity or role and forwards cancellation", async () => {
  const controller = new AbortController();
  const client = new StudySettingsClient(async (path, init) => {
    assert.equal(path, "/users/me/preferences"); assert.equal(init.signal, controller.signal); assert.equal(init.cache, "no-store");
    return Response.json({ ...settings, role: "ADMIN", id: "other", interfaceLanguage: "uk" });
  });
  assert.deepEqual(await client.get(controller.signal), settings);
});
test("saves only timezone and goal, preserving all other preferences", async () => {
  const client = new StudySettingsClient(async (path, init) => {
    assert.equal(path, "/users/me/preferences"); assert.equal(init.method, "PATCH");
    assert.deepEqual(JSON.parse(init.body), settings);
    return Response.json({ ...settings, interfaceLanguage: "uk", translationLanguage: "de" });
  });
  assert.deepEqual(await client.save({ ...settings, role: "ADMIN" }), settings);
});
test("invalid settings are rejected before sending requests", async () => {
  let calls = 0; const client = new StudySettingsClient(async () => { calls++; return Response.json(settings); });
  for (const bad of [{ ...settings, dailyGoal: 0 }, { ...settings, dailyGoal: 501 }, { ...settings, dailyGoal: 2.5 }, { ...settings, dailyGoal: "20" }, { ...settings, timeZone: "+02:00" }, { ...settings, timeZone: "Mars/Test" }]) await assert.rejects(client.save(bad));
  assert.equal(calls, 0); assert.equal(validSettings({ timeZone: "UTC", dailyGoal: 1 }), true); assert.equal(validSettings({ timeZone: "UTC", dailyGoal: 500 }), true);
});
test("malformed settings and mismatched confirmations cannot appear saved", async () => {
  for (const value of [null, {}, { ...settings, dailyGoal: null }, { ...settings, timeZone: "bad" }]) {
    const client = new StudySettingsClient(async () => Response.json(value));
    await assert.rejects(client.get());
  }
  for (const value of [{ ...settings, dailyGoal: 21 }, { ...settings, timeZone: "UTC" }]) {
    await assert.rejects(new StudySettingsClient(async () => Response.json(value)).save(settings));
  }
  assert.deepEqual(await new StudySettingsClient(async () => Response.json(settings)).save({ ...settings, timeZone: "europe/berlin" }), settings);
});
test("failed or aborted writes are never automatically repeated", async () => {
  for (const status of [400, 401, 500]) {
    let calls = 0; const client = new StudySettingsClient(async () => { calls++; return new Response(null, { status }); });
    await assert.rejects(client.save(settings)); assert.equal(calls, 1);
  }
  const client = new StudySettingsClient(async () => { throw new DOMException("aborted", "AbortError"); });
  await assert.rejects(client.get(), { name: "AbortError" });
});
