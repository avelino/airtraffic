import type { Destination, NewDestination } from "./types";

export interface EngineTab {
  id: number;
  url?: string;
  windowId: number;
  index: number;
  active: boolean;
  cookieStoreId?: string; // Firefox only
  groupId?: number; // Chrome only
}

export interface Engine {
  readonly id: "firefox" | "chrome";
  /** Destination colour names this engine accepts, mapped to a preview swatch. */
  readonly colors: Record<string, string>;
  /** Destination icon names mapped to their glyph. Absent when the engine has no icons. */
  readonly icons?: Record<string, string>;
  listDestinations(): Promise<Destination[]>;
  createDestination(input: NewDestination): Promise<Destination>;
  updateDestination(id: string, patch: Partial<NewDestination>): Promise<void>;
  deleteDestination(id: string): Promise<void>;
  shouldSkip(tabId: number): boolean;
  currentDestinationId(tab: EngineTab): Promise<string>;
  /**
   * Routes `tab` to `destinationId`. Returns true when the tab was routed,
   * false when it was not (missing destination, browser call failed, ...).
   * Never rejects: callers treat a false as "left where it was".
   */
  applyRoute(tab: EngineTab, destinationId: string): Promise<boolean>;
  openInDestination(url: string, destinationId: string, refTab: EngineTab): Promise<void>;
  onDestinationsChanged(cb: () => void): void;
}
