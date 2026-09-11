export interface ChromeTabGroupRef {
  id: number;
  title: string;
}

export type GroupPlan = { action: "reuse"; groupId: number } | { action: "create" };

export function planGroupAction(existingGroups: ChromeTabGroupRef[], destinationName: string): GroupPlan {
  const match = existingGroups.find((g) => g.title === destinationName);
  return match ? { action: "reuse", groupId: match.id } : { action: "create" };
}
