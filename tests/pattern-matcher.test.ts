import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findMatchingRule, urlMatchesPattern } from "../src/core/pattern-matcher";

describe("urlMatchesPattern", () => {
  it("matches contains pattern (case insensitive)", () => {
    const rule = { id: "1", pattern: "buser", matchType: "contains" as const, destinationId: "firefox-container-1" };
    assert.equal(urlMatchesPattern("https://app.buser.com.br/tickets", rule), true);
    assert.equal(urlMatchesPattern("https://BUSER.com.br", rule), true);
    assert.equal(urlMatchesPattern("https://example.com", rule), false);
  });

  it("matches startsWith pattern", () => {
    const rule = { id: "1", pattern: "https://github.com", matchType: "startsWith" as const, destinationId: "firefox-container-1" };
    assert.equal(urlMatchesPattern("https://github.com/avelino", rule), true);
    assert.equal(urlMatchesPattern("https://gitlab.com/github.com", rule), false);
  });

  it("matches startsWith pattern (case insensitive)", () => {
    const rule = { id: "1", pattern: "https://GitHub.com", matchType: "startsWith" as const, destinationId: "firefox-container-1" };
    assert.equal(urlMatchesPattern("https://github.com/repo", rule), true);
  });

  it("matches regex pattern", () => {
    const rule = { id: "1", pattern: "^https://(www\\.)?github\\.com", matchType: "regex" as const, destinationId: "firefox-container-1" };
    assert.equal(urlMatchesPattern("https://github.com/avelino", rule), true);
    assert.equal(urlMatchesPattern("https://www.github.com/avelino", rule), true);
    assert.equal(urlMatchesPattern("https://gitlab.com", rule), false);
  });

  it("returns false for invalid regex (does not throw)", () => {
    const rule = { id: "1", pattern: "[invalid(", matchType: "regex" as const, destinationId: "firefox-container-1" };
    assert.equal(urlMatchesPattern("https://example.com", rule), false);
  });

  it("matches domain exactly and subdomains", () => {
    const rule = { id: "1", pattern: "github.com", matchType: "domain" as const, destinationId: "firefox-container-1" };
    assert.equal(urlMatchesPattern("https://github.com/avelino", rule), true);
    assert.equal(urlMatchesPattern("https://www.github.com/avelino", rule), true);
    assert.equal(urlMatchesPattern("https://api.github.com/repos", rule), true);
    assert.equal(urlMatchesPattern("https://notgithub.com", rule), false);
    assert.equal(urlMatchesPattern("https://github.company.com", rule), false);
    assert.equal(urlMatchesPattern("https://fakegithub.com.br", rule), false);
  });

  it("matches domain case insensitive", () => {
    const rule = { id: "1", pattern: "GitHub.com", matchType: "domain" as const, destinationId: "firefox-container-1" };
    assert.equal(urlMatchesPattern("https://github.com/repo", rule), true);
  });

  it("matches domain with invalid URL gracefully", () => {
    const rule = { id: "1", pattern: "github.com", matchType: "domain" as const, destinationId: "firefox-container-1" };
    assert.equal(urlMatchesPattern("not-a-url", rule), false);
    assert.equal(urlMatchesPattern("", rule), false);
  });

  it("matches domainContains for partial domain match", () => {
    const rule = { id: "1", pattern: "google", matchType: "domainContains" as const, destinationId: "firefox-container-1" };
    assert.equal(urlMatchesPattern("https://mail.google.com", rule), true);
    assert.equal(urlMatchesPattern("https://docs.google.com.br", rule), true);
    assert.equal(urlMatchesPattern("https://google.com", rule), true);
    assert.equal(urlMatchesPattern("https://example.com/search?q=google", rule), false);
  });

  it("matches domainContains case insensitive", () => {
    const rule = { id: "1", pattern: "Google", matchType: "domainContains" as const, destinationId: "firefox-container-1" };
    assert.equal(urlMatchesPattern("https://docs.google.com", rule), true);
  });

  it("matches domainContains with invalid URL gracefully", () => {
    const rule = { id: "1", pattern: "google", matchType: "domainContains" as const, destinationId: "firefox-container-1" };
    assert.equal(urlMatchesPattern("not-a-url", rule), false);
  });

  it("returns false for unknown matchType", () => {
    const rule = { id: "1", pattern: "test", matchType: "unknown" as const, destinationId: "firefox-container-1" };
    // @ts-expect-error testing invalid matchType
    assert.equal(urlMatchesPattern("https://test.com", rule), false);
  });

  it("matches wildcard pattern with * as glob", () => {
    const rule = { id: "1", pattern: "*.github.com", matchType: "wildcard" as const, destinationId: "firefox-container-1" };
    assert.equal(urlMatchesPattern("https://api.github.com/repos", rule), true);
    assert.equal(urlMatchesPattern("https://www.github.com", rule), true);
    assert.equal(urlMatchesPattern("https://github.com", rule), false);
  });

  it("matches wildcard with ** prefix for any URL", () => {
    const rule = { id: "1", pattern: "*github.com*", matchType: "wildcard" as const, destinationId: "firefox-container-1" };
    assert.equal(urlMatchesPattern("https://github.com/avelino", rule), true);
    assert.equal(urlMatchesPattern("https://api.github.com", rule), true);
    assert.equal(urlMatchesPattern("https://fakegithub.com", rule), true);
  });

  it("matches wildcard pattern with path glob", () => {
    const rule = { id: "1", pattern: "github.com/avelino/*", matchType: "wildcard" as const, destinationId: "firefox-container-1" };
    assert.equal(urlMatchesPattern("https://github.com/avelino/firefox-airtraffic", rule), true);
    assert.equal(urlMatchesPattern("https://github.com/avelino/", rule), true);
    assert.equal(urlMatchesPattern("https://github.com/other/repo", rule), false);
  });

  it("matches wildcard case insensitive", () => {
    const rule = { id: "1", pattern: "*.GitHub.COM/*", matchType: "wildcard" as const, destinationId: "firefox-container-1" };
    assert.equal(urlMatchesPattern("https://api.github.com/repos", rule), true);
  });

  it("wildcard with no * acts as contains", () => {
    const rule = { id: "1", pattern: "github.com", matchType: "wildcard" as const, destinationId: "firefox-container-1" };
    assert.equal(urlMatchesPattern("https://github.com/avelino", rule), true);
    assert.equal(urlMatchesPattern("https://example.com", rule), false);
  });

  it("wildcard escapes regex special chars", () => {
    const rule = { id: "1", pattern: "github.com/avelino/*", matchType: "wildcard" as const, destinationId: "firefox-container-1" };
    assert.equal(urlMatchesPattern("https://githubXcom/avelino/test", rule), false);
  });

  describe("negated rules", () => {
    it("negated domain: false for matching URL, true for non-matching", () => {
      const rule = { id: "1", pattern: "work.company.com", matchType: "domain" as const, destinationId: "c1", negate: true };
      assert.equal(urlMatchesPattern("https://work.company.com/dashboard", rule), false);
      assert.equal(urlMatchesPattern("https://github.com", rule), true);
    });

    it("negated contains: false for URL with pattern, true without", () => {
      const rule = { id: "1", pattern: "work", matchType: "contains" as const, destinationId: "c1", negate: true };
      assert.equal(urlMatchesPattern("https://work.company.com", rule), false);
      assert.equal(urlMatchesPattern("https://github.com", rule), true);
    });

    it("negated regex: inverts match result", () => {
      const rule = { id: "1", pattern: "^https://(www\\.)?work\\.com", matchType: "regex" as const, destinationId: "c1", negate: true };
      assert.equal(urlMatchesPattern("https://work.com/app", rule), false);
      assert.equal(urlMatchesPattern("https://github.com", rule), true);
    });

    it("negated wildcard: inverts match result", () => {
      const rule = { id: "1", pattern: "*.work.com", matchType: "wildcard" as const, destinationId: "c1", negate: true };
      assert.equal(urlMatchesPattern("https://app.work.com/page", rule), false);
      assert.equal(urlMatchesPattern("https://github.com", rule), true);
    });

    it("negated domainContains: inverts match result", () => {
      const rule = { id: "1", pattern: "work", matchType: "domainContains" as const, destinationId: "c1", negate: true };
      assert.equal(urlMatchesPattern("https://work.company.com", rule), false);
      assert.equal(urlMatchesPattern("https://github.com", rule), true);
    });

    it("negate: false behaves like no negate", () => {
      const rule = { id: "1", pattern: "github.com", matchType: "domain" as const, destinationId: "c1", negate: false };
      assert.equal(urlMatchesPattern("https://github.com", rule), true);
      assert.equal(urlMatchesPattern("https://example.com", rule), false);
    });

    it("rule without negate field behaves normally (backward compat)", () => {
      const rule = { id: "1", pattern: "github.com", matchType: "domain" as const, destinationId: "c1" };
      assert.equal(urlMatchesPattern("https://github.com", rule), true);
      assert.equal(urlMatchesPattern("https://example.com", rule), false);
    });

    it("negated domain with invalid URL returns true (no hostname = no match = negated to true)", () => {
      const rule = { id: "1", pattern: "work.com", matchType: "domain" as const, destinationId: "c1", negate: true };
      assert.equal(urlMatchesPattern("not-a-url", rule), true);
    });
  });
});

describe("findMatchingRule", () => {
  const rules = [
    { id: "1", pattern: "github.com", matchType: "contains" as const, destinationId: "firefox-container-1" },
    { id: "2", pattern: "buser", matchType: "contains" as const, destinationId: "firefox-container-2" },
    { id: "3", pattern: "^https://slack\\.com", matchType: "regex" as const, destinationId: "firefox-container-3" },
  ];

  it("returns the first matching rule", () => {
    const result = findMatchingRule("https://github.com/avelino", rules);
    assert.deepEqual(result, rules[0]);
  });

  it("returns null when no rule matches", () => {
    const result = findMatchingRule("https://example.com", rules);
    assert.equal(result, null);
  });

  it("returns null for empty rules array", () => {
    assert.equal(findMatchingRule("https://github.com", []), null);
  });

  it("returns null for undefined/null rules", () => {
    assert.equal(findMatchingRule("https://github.com", undefined), null);
    assert.equal(findMatchingRule("https://github.com", null), null);
  });

  it("first matching rule wins (order matters)", () => {
    const overlapping = [
      { id: "a", pattern: "github", matchType: "contains" as const, destinationId: "firefox-container-1" },
      { id: "b", pattern: "github.com", matchType: "contains" as const, destinationId: "firefox-container-2" },
    ];
    const result = findMatchingRule("https://github.com", overlapping);
    assert.equal(result?.id, "a");
  });

  it("negated rule matches URLs that do NOT match the pattern", () => {
    const rules = [
      { id: "1", pattern: "work.company.com", matchType: "domain" as const, destinationId: "personal", negate: true },
    ];
    assert.equal(findMatchingRule("https://github.com", rules)?.id, "1");
    assert.equal(findMatchingRule("https://work.company.com", rules), null);
  });

  it("positive rule before negated rule: positive wins for matching URL", () => {
    const rules = [
      { id: "pos", pattern: "github.com", matchType: "domain" as const, destinationId: "dev" },
      { id: "neg", pattern: "work.company.com", matchType: "domain" as const, destinationId: "personal", negate: true },
    ];
    assert.equal(findMatchingRule("https://github.com", rules)?.id, "pos");
    assert.equal(findMatchingRule("https://random.com", rules)?.id, "neg");
    assert.equal(findMatchingRule("https://work.company.com", rules), null);
  });
});
