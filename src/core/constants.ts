import type { MatchTypeConfig } from "./types";

export const MATCH_TYPE_CONFIG: Record<string, MatchTypeConfig> = {
  domain:         { placeholder: "github.com",              hint: "Matches github.com and all subdomains",    label: "Domain" },
  domainContains: { placeholder: "google",                  hint: "Matches any domain containing \"google\"", label: "Domain contains" },
  contains:       { placeholder: "buser",                   hint: "Matches any URL containing this text",     label: "URL contains" },
  wildcard:       { placeholder: "*.github.com/avelino/*",  hint: "Use * as wildcard for any characters",     label: "Wildcard" },
  regex:          { placeholder: "^https://(www\\.)?g.*",   hint: "Regular expression (advanced)",            label: "Regex" },
};
