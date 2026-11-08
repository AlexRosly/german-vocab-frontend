const api = process.env.NEXT_PUBLIC_API_URL;
let origin;
try { origin = new URL(process.env.API_PROXY_ORIGIN ?? ""); } catch { /* report names only */ }
if (api !== "/api/v1" || !origin || origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
  console.error("Netlify: set NEXT_PUBLIC_API_URL=/api/v1 and API_PROXY_ORIGIN to the public HTTPS backend origin, without credentials, path, query or fragment.");
  process.exitCode = 1;
} else console.log("Netlify API proxy configuration is valid.");
