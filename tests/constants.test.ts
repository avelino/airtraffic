import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MATCH_TYPE_CONFIG } from "../src/core/constants";

describe("MATCH_TYPE_CONFIG", () => {
  const expectedTypes = ["domain", "domainContains", "contains", "wildcard", "regex"];

  it("has config for all match types", () => {
    for (const type of expectedTypes) {
      assert.ok(MATCH_TYPE_CONFIG[type], `missing config for match type: ${type}`);
    }
  });

  it("each config has required fields", () => {
    for (const [type, config] of Object.entries(MATCH_TYPE_CONFIG)) {
      assert.ok(config.placeholder, `${type} missing placeholder`);
      assert.ok(config.hint, `${type} missing hint`);
      assert.ok(config.label, `${type} missing label`);
    }
  });

  it("has no extra match types without corresponding config", () => {
    const configKeys = Object.keys(MATCH_TYPE_CONFIG);
    assert.deepEqual(configKeys.sort(), expectedTypes.sort());
  });
});
