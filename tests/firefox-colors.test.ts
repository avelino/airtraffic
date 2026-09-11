import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONTAINER_COLORS, CONTAINER_ICONS } from "../src/engines/firefox/colors";

describe("CONTAINER_COLORS", () => {
  it("has standard Firefox container colors", () => {
    const required = ["blue", "turquoise", "green", "yellow", "orange", "red", "pink", "purple"];
    for (const color of required) {
      assert.ok(CONTAINER_COLORS[color], `missing color: ${color}`);
    }
  });

  it("all values are hex color strings", () => {
    for (const [name, value] of Object.entries(CONTAINER_COLORS)) {
      assert.match(value, /^#[0-9a-f]{6}$/i, `${name} is not a valid hex color: ${value}`);
    }
  });
});

describe("CONTAINER_ICONS", () => {
  it("has standard Firefox container icons", () => {
    const required = ["fingerprint", "briefcase", "dollar", "cart", "circle", "gift", "vacation", "food", "fruit", "pet", "tree", "chill", "fence"];
    for (const icon of required) {
      assert.ok(CONTAINER_ICONS[icon], `missing icon: ${icon}`);
    }
  });

  it("all values are non-empty strings", () => {
    for (const [name, value] of Object.entries(CONTAINER_ICONS)) {
      assert.ok(value.length > 0, `${name} icon is empty`);
    }
  });
});
