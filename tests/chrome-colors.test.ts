import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CHROME_GROUP_COLORS } from "../src/engines/chrome/colors";

describe("CHROME_GROUP_COLORS", () => {
  it("has all native Chrome tab group colors", () => {
    const required = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];
    for (const color of required) {
      assert.ok(CHROME_GROUP_COLORS[color], `missing color: ${color}`);
    }
  });

  it("all values are hex color strings", () => {
    for (const [name, value] of Object.entries(CHROME_GROUP_COLORS)) {
      assert.match(value, /^#[0-9a-f]{6}$/i, `${name} is not a valid hex color: ${value}`);
    }
  });

  it("has exactly 9 colors (Chrome's fixed palette)", () => {
    assert.equal(Object.keys(CHROME_GROUP_COLORS).length, 9);
  });
});
