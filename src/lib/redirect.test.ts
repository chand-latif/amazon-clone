import assert from "node:assert/strict";
import { test } from "node:test";
import { safeNextPath } from "./redirect.ts";

// `next` comes straight from a URL anyone can send to a victim, so this validator is
// the only thing between "sign in" and an open redirect.

test("same-origin paths are kept, query strings included", () => {
  for (const ok of ["/", "/orders", "/orders?page=2", "/p/some-slug", "/s?k=a+b&c=x", "/checkout", "/a/b/c?x=1&y=2"]) {
    assert.equal(safeNextPath(ok), ok, ok);
  }
});

test("absolute and protocol-relative URLs are rejected", () => {
  for (const bad of [
    "https://evil.com",
    "http://evil.com/x",
    "//evil.com",
    "///evil.com",
    "evil.com",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "mailto:a@b.c",
    "/\\evil.com",
    "\\\\evil.com",
    "/\\/evil.com",
  ]) {
    assert.equal(safeNextPath(bad), "/", bad);
  }
});

test("control characters (browsers strip them, turning /\\t/evil.com into //evil.com) are rejected", () => {
  for (const bad of ["/\t/evil.com", "/\n/evil.com", "/\r/evil.com", "/\u0000/evil.com", "/ok\u007f", "/a\u001fb"]) {
    assert.equal(safeNextPath(bad), "/", JSON.stringify(bad));
  }
});

test("auth pages are never a redirect target (no loops)", () => {
  for (const bad of ["/signin", "/signin?next=/x", "/signup", "/signup/", "/auth/callback", "/auth/callback?next=/x", "/signin/anything"]) {
    assert.equal(safeNextPath(bad), "/", bad);
  }
  // but lookalikes that merely start with the same letters are fine
  assert.equal(safeNextPath("/signing-off"), "/signing-off");
  assert.equal(safeNextPath("/authors"), "/authors");
});

test("non-strings, empty and oversized input fall back", () => {
  for (const bad of [undefined, null, 0, 1, {}, [], ["/x"], true]) {
    assert.equal(safeNextPath(bad), "/");
  }
  assert.equal(safeNextPath(""), "/");
  assert.equal(safeNextPath("/" + "a".repeat(499)), "/" + "a".repeat(499)); // 500 chars: still allowed
  assert.equal(safeNextPath("/" + "a".repeat(500)), "/"); // 501: rejected
});

test("the fallback is configurable", () => {
  assert.equal(safeNextPath("//evil.com", "/account"), "/account");
  assert.equal(safeNextPath(undefined, "/orders"), "/orders");
  assert.equal(safeNextPath("/ok", "/account"), "/ok");
});

test("the result is always a same-origin path", () => {
  for (const raw of ["/a/../b", "/./x", "/%2F%2Fevil.com", "/%5Cevil.com", "/x#frag", "/?a=//evil.com"]) {
    const out = safeNextPath(raw);
    assert.ok(out.startsWith("/") && !out.startsWith("//"), `${raw} -> ${out}`);
    assert.equal(new URL(out, "http://internal.invalid").origin, "http://internal.invalid", raw);
  }
});
