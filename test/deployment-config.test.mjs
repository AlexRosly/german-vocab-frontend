import { test } from "node:test";
import assert from "node:assert/strict";
import config from "../next.config.ts";

async function rewriteWith(origin, clientUrl = "/api/v1") {
  const previous = { proxy: process.env.API_PROXY_ORIGIN, client: process.env.NEXT_PUBLIC_API_URL };
  try {
    if (origin === undefined) delete process.env.API_PROXY_ORIGIN; else process.env.API_PROXY_ORIGIN = origin;
    process.env.NEXT_PUBLIC_API_URL = clientUrl;
    return await config.rewrites();
  } finally {
    if (previous.proxy === undefined) delete process.env.API_PROXY_ORIGIN; else process.env.API_PROXY_ORIGIN = previous.proxy;
    if (previous.client === undefined) delete process.env.NEXT_PUBLIC_API_URL; else process.env.NEXT_PUBLIC_API_URL = previous.client;
  }
}

test("ordinary local development does not enable an API proxy", async () => {
  assert.deepEqual(await rewriteWith(undefined, "http://localhost:3001/api/v1"), []);
});

test("deployment proxies only the versioned API path to the configured HTTPS origin", async () => {
  for (const origin of ["https://wortkarten-api.onrender.com", "https://wortkarten-api.onrender.com/"]) {
    assert.deepEqual(await rewriteWith(origin), [{ source: "/api/v1/:path*", destination: "https://wortkarten-api.onrender.com/api/v1/:path*" }]);
  }
});

test("proxy deployment cannot silently send browser credentials directly to another origin", async () => {
  for (const clientUrl of ["http://localhost:3001/api/v1", "https://other.example/api/v1", "/other-api"]) {
    await assert.rejects(rewriteWith("https://api.example", clientUrl), /NEXT_PUBLIC_API_URL/);
  }
});

test("proxy destinations reject credentials, URL suffixes and unencrypted remote hosts", async () => {
  for (const origin of ["https://name:secret@api.example", "https://api.example/api/v1", "https://api.example?x=y", "https://api.example#secret", "http://api.example", "ftp://api.example"]) {
    await assert.rejects(rewriteWith(origin));
  }
});

test("local proxy verification can use loopback HTTP without changing production requirements", async () => {
  assert.deepEqual(await rewriteWith("http://127.0.0.1:3101"), [{ source: "/api/v1/:path*", destination: "http://127.0.0.1:3101/api/v1/:path*" }]);
});
