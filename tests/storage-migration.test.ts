import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { migrateRuleSchema, migrateSettingsSchema, validateImportedRule } from "../src/core/storage";

describe("migrateRuleSchema", () => {
  it("renames cookieStoreId to destinationId", () => {
    const migrated = migrateRuleSchema({ id: "1", pattern: "github.com", matchType: "domain", cookieStoreId: "container-dev" });
    assert.equal(migrated.destinationId, "container-dev");
    assert.equal((migrated as Record<string, unknown>).cookieStoreId, undefined);
  });

  it("is a no-op when destinationId is already present", () => {
    const migrated = migrateRuleSchema({ id: "1", pattern: "github.com", matchType: "domain", destinationId: "dest-1" });
    assert.equal(migrated.destinationId, "dest-1");
  });

  it("preserves other fields (negate, action, pattern, matchType)", () => {
    const migrated = migrateRuleSchema({ id: "1", pattern: "work.com", matchType: "domain", cookieStoreId: "c1", negate: true, action: "ignore" });
    assert.deepEqual(migrated, { id: "1", pattern: "work.com", matchType: "domain", negate: true, action: "ignore", destinationId: "c1" });
  });
});

describe("validateImportedRule", () => {
  it("accepts Ignore without a destination", () => {
    assert.deepEqual(validateImportedRule({ id: "ignore", pattern: "github.com", matchType: "domain", action: "ignore" }), {
      id: "ignore", pattern: "github.com", matchType: "domain", action: "ignore",
    });
  });

  it("preserves legacy route rules without an action", () => {
    assert.ok(validateImportedRule({ id: "legacy", pattern: "github.com", matchType: "domain", destinationId: "dev" }));
  });

  it("rejects route rules without a destination", () => {
    assert.equal(validateImportedRule({ id: "route", pattern: "github.com", matchType: "domain", action: "route" }), null);
  });

  it("rejects unknown explicit actions instead of defaulting them", () => {
    assert.equal(validateImportedRule({ id: "bad", pattern: "github.com", matchType: "domain", destinationId: "dev", action: "skip" }), null);
  });
});

describe("migrateSettingsSchema", () => {
  it("renames defaultContainer to defaultDestinationId", () => {
    const migrated = migrateSettingsSchema({ mode: "route_all", defaultContainer: "container-personal", useSync: false });
    assert.equal(migrated.defaultDestinationId, "container-personal");
    assert.equal((migrated as Record<string, unknown>).defaultContainer, undefined);
  });

  it("is a no-op when defaultDestinationId is already present", () => {
    const migrated = migrateSettingsSchema({ mode: "route_all", defaultDestinationId: "dest-1", useSync: false });
    assert.equal(migrated.defaultDestinationId, "dest-1");
  });
});
