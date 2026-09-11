import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planGroupAction } from "../src/engines/chrome/group-planner";

describe("planGroupAction", () => {
  it("reuses an existing group with a matching title", () => {
    const plan = planGroupAction([{ id: 7, title: "Work" }, { id: 9, title: "Social" }], "Work");
    assert.deepEqual(plan, { action: "reuse", groupId: 7 });
  });

  it("creates a new group when no title matches", () => {
    const plan = planGroupAction([{ id: 7, title: "Work" }], "Social");
    assert.deepEqual(plan, { action: "create" });
  });

  it("creates a new group when there are no existing groups", () => {
    const plan = planGroupAction([], "Work");
    assert.deepEqual(plan, { action: "create" });
  });

  it("is case-sensitive on the title match", () => {
    const plan = planGroupAction([{ id: 7, title: "work" }], "Work");
    assert.deepEqual(plan, { action: "create" });
  });
});
