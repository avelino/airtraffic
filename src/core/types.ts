export type MatchType = "domain" | "domainContains" | "contains" | "startsWith" | "wildcard" | "regex";

export type RuleAction = "route" | "ignore";

export interface Rule {
  id: string;
  pattern: string;
  matchType: MatchType;
  destinationId?: string;
  action?: RuleAction;
  negate?: boolean;
}

export interface Settings {
  mode: "route_matched" | "route_all";
  defaultDestinationId: string;
  useSync: boolean;
}

export interface Destination {
  id: string;
  name: string;
  color: string;
  icon?: string;
}

export type NewDestination = Omit<Destination, "id">;

export interface MatchTypeConfig {
  placeholder: string;
  hint: string;
  label: string;
}

export interface RulesUIOptions {
  rulesList: HTMLUListElement;
  patternInput: HTMLInputElement;
  matchTypeSelect: HTMLSelectElement;
  destinationSelect: HTMLSelectElement;
  actionSelect: HTMLSelectElement;
  destinationField: HTMLElement;
  submitBtn: HTMLButtonElement;
  cancelBtn: HTMLButtonElement;
  matchHint: HTMLElement;
  form: HTMLFormElement;
  negateCheckbox?: HTMLInputElement;
  colorMap: Record<string, string>;
  onRulesChanged?: () => void;
}
