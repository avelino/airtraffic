import type { Rule } from "./types";

function extractHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function urlMatchesPattern(url: string, rule: Rule): boolean {
  const lowerUrl = url.toLowerCase();
  const lowerPattern = rule.pattern.toLowerCase();

  let matched: boolean;
  switch (rule.matchType) {
    case "domain": {
      const hostname = extractHostname(url);
      matched = hostname !== null && (hostname === lowerPattern || hostname.endsWith("." + lowerPattern));
      break;
    }
    case "domainContains": {
      const hostname = extractHostname(url);
      matched = hostname !== null && hostname.includes(lowerPattern);
      break;
    }
    case "contains":
      matched = lowerUrl.includes(lowerPattern);
      break;
    case "startsWith":
      matched = lowerUrl.startsWith(lowerPattern);
      break;
    case "wildcard": {
      const escaped = lowerPattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
      try {
        matched = new RegExp(escaped, "i").test(url);
      } catch {
        matched = false;
      }
      break;
    }
    case "regex":
      try {
        matched = new RegExp(rule.pattern, "i").test(url);
      } catch {
        matched = false;
      }
      break;
    default:
      matched = false;
  }

  return rule.negate ? !matched : matched;
}

export function findMatchingRule(url: string, rules: Rule[] | null | undefined): Rule | null {
  if (!rules) return null;
  for (const rule of rules) {
    if (urlMatchesPattern(url, rule)) return rule;
  }
  return null;
}
