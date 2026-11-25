import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Engine, EngineTab } from "../src/core/engine";
import { runBackground } from "../src/ui/background";

function listener<T extends (...args: any[]) => any>() {
  let callback: T | undefined;
  return {
    addListener(value: T) { callback = value; },
    get callback() { return callback!; },
  };
}

describe("background routing", () => {
  it("does not apply routes or update the badge for an Ignore rule", async () => {
    let applyCalls = 0;
    let badgeUpdates = 0;
    const tabUpdated = listener<(tabId: number, changeInfo: { url?: string }, tab: EngineTab) => Promise<void>>();
    const contextClicked = listener<(...args: any[]) => any>();
    const storageChanged = listener<(...args: any[]) => any>();

    const local = {
      async get(key: string) {
        return key === "settings"
          ? { settings: { mode: "route_all", defaultDestinationId: "default", useSync: false } }
          : { rules: [{ id: "ignore", pattern: "example.com", matchType: "domain", action: "ignore" }] };
      },
    };
    (globalThis as any).browser = {
      storage: { local, sync: local, onChanged: storageChanged },
      tabs: { onUpdated: tabUpdated },
      action: {
        setBadgeText() { badgeUpdates++; },
        setBadgeBackgroundColor() {},
      },
      contextMenus: {
        onClicked: contextClicked,
        async removeAll() {},
        create() {},
      },
    };

    const engine = {
      shouldSkip: () => false,
      currentDestinationId: async () => "current",
      applyRoute: async () => { applyCalls++; return true; },
      listDestinations: async () => [],
      onDestinationsChanged() {},
      openInDestination: async () => {},
    } as unknown as Engine;

    runBackground(engine);
    await tabUpdated.callback(1, { url: "https://example.com" }, {
      id: 1, windowId: 1, index: 0, active: true,
    });

    assert.equal(applyCalls, 0);
    assert.equal(badgeUpdates, 0);
  });
});
