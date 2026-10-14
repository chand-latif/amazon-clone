import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveSiteUrl } from "./site-url-resolve.ts";

const prod = { isProduction: true };
const dev = { isProduction: false, requestOrigin: () => "http://localhost:3001" };

test("configured URL wins and is reduced to its origin", () => {
  assert.equal(resolveSiteUrl({ ...prod, configured: "https://shop.example.com/" }), "https://shop.example.com");
  assert.equal(resolveSiteUrl({ ...prod, configured: " https://shop.example.com/a/b?x=1#h " }), "https://shop.example.com");
});

test("production requires https and rejects junk", () => {
  assert.throws(() => resolveSiteUrl({ ...prod, configured: "http://shop.example.com" }), /https/);
  assert.throws(() => resolveSiteUrl({ ...prod, configured: "not a url" }), /valid URL/);
  assert.throws(() => resolveSiteUrl({ ...prod, configured: "javascript:alert(1)" }), /https/);
  assert.throws(() => resolveSiteUrl({ ...prod, configured: "https://user:pw@shop.example.com" }), /credentials/);
});

test("production without config fails closed and never trusts the request", () => {
  let asked = false;
  assert.throws(
    () => resolveSiteUrl({ ...prod, requestOrigin: () => ((asked = true), "https://evil.example") }),
    /must be set in production/,
  );
  assert.equal(asked, false);
});

test("a forged request host is ignored whenever a trusted URL exists", () => {
  const forged = () => "https://evil.example";
  assert.equal(resolveSiteUrl({ ...prod, configured: "https://shop.example.com", requestOrigin: forged }), "https://shop.example.com");
  assert.equal(
    resolveSiteUrl({ ...prod, vercelEnv: "production", vercelProductionHost: "shop.vercel.app", requestOrigin: forged }),
    "https://shop.vercel.app",
  );
});

test("Vercel: production host on production, deployment host on preview", () => {
  assert.equal(
    resolveSiteUrl({ ...prod, vercelEnv: "production", vercelProductionHost: "shop.vercel.app", vercelDeploymentHost: "shop-abc.vercel.app" }),
    "https://shop.vercel.app",
  );
  assert.equal(
    resolveSiteUrl({ ...prod, vercelEnv: "preview", vercelProductionHost: "shop.vercel.app", vercelDeploymentHost: "shop-abc.vercel.app" }),
    "https://shop-abc.vercel.app",
  );
  assert.throws(() => resolveSiteUrl({ ...prod, vercelEnv: "production", vercelDeploymentHost: "x.vercel.app" }), /must be set/);
});

test("development falls back to the request origin (http allowed)", () => {
  assert.equal(resolveSiteUrl(dev), "http://localhost:3001");
  assert.equal(resolveSiteUrl({ ...dev, configured: "http://localhost:3000" }), "http://localhost:3000");
  assert.throws(() => resolveSiteUrl({ isProduction: false }), /must be set/);
});
