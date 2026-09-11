import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isIgnoredUrl, resolveRoute } from "../src/core/route-resolver";
import type { Rule, Settings } from "../src/core/types";

describe("isIgnoredUrl", () => {
  it("ignores about: URLs", () => {
    assert.equal(isIgnoredUrl("about:blank"), true);
    assert.equal(isIgnoredUrl("about:config"), true);
  });

  it("ignores moz-extension: URLs", () => {
    assert.equal(isIgnoredUrl("moz-extension://abc/popup.html"), true);
  });

  it("ignores chrome-extension: URLs", () => {
    assert.equal(isIgnoredUrl("chrome-extension://abc/popup.html"), true);
  });

  it("ignores chrome: and resource: URLs", () => {
    assert.equal(isIgnoredUrl("chrome://settings"), true);
    assert.equal(isIgnoredUrl("resource://foo"), true);
  });

  it("ignores data: and blob: URLs", () => {
    assert.equal(isIgnoredUrl("data:text/html,hello"), true);
    assert.equal(isIgnoredUrl("blob:http://example.com/abc"), true);
  });

  it("ignores empty string", () => {
    assert.equal(isIgnoredUrl(""), true);
  });

  it("allows http/https URLs", () => {
    assert.equal(isIgnoredUrl("https://github.com"), false);
    assert.equal(isIgnoredUrl("http://example.com"), false);
  });
});

describe("resolveRoute", () => {
  const rules: Rule[] = [
    { id: "1", pattern: "github.com", matchType: "domain", destinationId: "dest-dev" },
    { id: "2", pattern: "slack.com", matchType: "domain", destinationId: "dest-work" },
  ];

  describe("route_matched mode", () => {
    const settings: Settings = { mode: "route_matched", defaultDestinationId: "", useSync: false };

    it("returns route when URL matches a rule and tab is in the wrong destination", () => {
      const result = resolveRoute("https://github.com/repo", rules, settings, "default");
      assert.deepEqual(result, { action: "route", destinationId: "dest-dev" });
    });

    it("returns none when URL matches but tab is already in the correct destination", () => {
      const result = resolveRoute("https://github.com/repo", rules, settings, "dest-dev");
      assert.deepEqual(result, { action: "none" });
    });

    it("returns none when no rule matches", () => {
      const result = resolveRoute("https://example.com", rules, settings, "default");
      assert.deepEqual(result, { action: "none" });
    });

    it("returns none for ignored URLs", () => {
      const result = resolveRoute("about:blank", rules, settings, "default");
      assert.deepEqual(result, { action: "none" });
    });
  });

  describe("route_all mode", () => {
    const settings: Settings = { mode: "route_all", defaultDestinationId: "dest-personal", useSync: false };

    it("routes unmatched URLs to the default destination", () => {
      const result = resolveRoute("https://example.com", rules, settings, "default");
      assert.deepEqual(result, { action: "route", destinationId: "dest-personal" });
    });

    it("returns none when URL matches a rule (excluded from default)", () => {
      const result = resolveRoute("https://github.com/repo", rules, settings, "default");
      assert.deepEqual(result, { action: "none" });
    });

    it("returns none when tab is already in the default destination", () => {
      const result = resolveRoute("https://random.com", rules, settings, "dest-personal");
      assert.deepEqual(result, { action: "none" });
    });

    it("returns none when no default destination is set", () => {
      const noDefault: Settings = { mode: "route_all", defaultDestinationId: "", useSync: false };
      const result = resolveRoute("https://example.com", rules, noDefault, "default");
      assert.deepEqual(result, { action: "none" });
    });

    it("returns none for ignored URLs", () => {
      const result = resolveRoute("moz-extension://abc", rules, settings, "default");
      assert.deepEqual(result, { action: "none" });
    });
  });

  describe("negated rules integration", () => {
    const negatedRules: Rule[] = [
      { id: "1", pattern: "work.company.com", matchType: "domain", destinationId: "dest-personal", negate: true },
    ];
    const settings: Settings = { mode: "route_matched", defaultDestinationId: "", useSync: false };

    it("routes non-matching URLs (negate inverts the match)", () => {
      const result = resolveRoute("https://github.com", negatedRules, settings, "default");
      assert.deepEqual(result, { action: "route", destinationId: "dest-personal" });
    });

    it("does not route the excluded domain", () => {
      const result = resolveRoute("https://work.company.com/dashboard", negatedRules, settings, "default");
      assert.deepEqual(result, { action: "none" });
    });

    it("does not route when already in the correct destination", () => {
      const result = resolveRoute("https://random.com", negatedRules, settings, "dest-personal");
      assert.deepEqual(result, { action: "none" });
    });
  });

  describe("negated rules in route_all mode", () => {
    const negatedRules: Rule[] = [
      { id: "1", pattern: "work.company.com", matchType: "domain", destinationId: "dest-personal", negate: true },
    ];
    const settings: Settings = { mode: "route_all", defaultDestinationId: "dest-default", useSync: false };

    it("routes non-excluded URLs to the negated rule's destination", () => {
      const result = resolveRoute("https://github.com", negatedRules, settings, "default");
      assert.deepEqual(result, { action: "route", destinationId: "dest-personal" });
    });

    it("routes the excluded domain to the default destination", () => {
      const result = resolveRoute("https://work.company.com/dashboard", negatedRules, settings, "default");
      assert.deepEqual(result, { action: "route", destinationId: "dest-default" });
    });

    it("returns none when the excluded domain is already in the default destination", () => {
      const result = resolveRoute("https://work.company.com", negatedRules, settings, "dest-default");
      assert.deepEqual(result, { action: "none" });
    });

    it("returns none when the non-excluded URL is already in the rule's destination", () => {
      const result = resolveRoute("https://github.com", negatedRules, settings, "dest-personal");
      assert.deepEqual(result, { action: "none" });
    });
  });

  describe("rule priority (first match wins)", () => {
    it("positive rule before negated catch-all", () => {
      const mixed: Rule[] = [
        { id: "pos", pattern: "github.com", matchType: "domain", destinationId: "dest-dev" },
        { id: "neg", pattern: "work.com", matchType: "domain", destinationId: "dest-personal", negate: true },
      ];
      const settings: Settings = { mode: "route_matched", defaultDestinationId: "", useSync: false };

      const r1 = resolveRoute("https://github.com", mixed, settings, "default");
      assert.deepEqual(r1, { action: "route", destinationId: "dest-dev" });

      const r2 = resolveRoute("https://work.com", mixed, settings, "default");
      assert.deepEqual(r2, { action: "none" });

      const r3 = resolveRoute("https://random.com", mixed, settings, "default");
      assert.deepEqual(r3, { action: "route", destinationId: "dest-personal" });
    });
  });
});
