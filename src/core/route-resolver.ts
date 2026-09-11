import type { Rule, Settings } from "./types";
import { findMatchingRule } from "./pattern-matcher";

const IGNORED_PROTOCOLS = ["about:", "moz-extension:", "chrome-extension:", "chrome:", "resource:", "data:", "blob:"];

export type RouteResult =
  | { action: "route"; destinationId: string }
  | { action: "none" };

export function isIgnoredUrl(url: string): boolean {
  return !url || IGNORED_PROTOCOLS.some((p) => url.startsWith(p));
}

export function resolveRoute(
  url: string,
  rules: Rule[],
  settings: Settings,
  currentDestinationId: string,
): RouteResult {
  if (isIgnoredUrl(url)) return { action: "none" };

  if (settings.mode === "route_all") {
    if (!settings.defaultDestinationId) return { action: "none" };
    const rule = findMatchingRule(url, rules);
    if (rule) {
      if (rule.negate) {
        if (currentDestinationId === rule.destinationId) return { action: "none" };
        return { action: "route", destinationId: rule.destinationId };
      }
      return { action: "none" };
    }
    if (currentDestinationId === settings.defaultDestinationId) return { action: "none" };
    return { action: "route", destinationId: settings.defaultDestinationId };
  }

  const rule = findMatchingRule(url, rules);
  if (!rule) return { action: "none" };
  if (currentDestinationId === rule.destinationId) return { action: "none" };
  return { action: "route", destinationId: rule.destinationId };
}
