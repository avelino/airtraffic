import type { Engine } from "../core/engine";
import type { Destination } from "../core/types";

let cached: Destination[] = [];

export async function loadDestinationList(engine: Engine): Promise<Destination[]> {
  cached = await engine.listDestinations();
  return cached;
}

export function getDestinations(): Destination[] {
  return cached;
}

export function getDestinationName(id: string): string {
  const d = cached.find((d) => d.id === id);
  return d ? d.name : id;
}

export function getDestinationColor(id: string, colorMap: Record<string, string>): string {
  const d = cached.find((d) => d.id === id);
  if (!d) return "#555";
  return colorMap[d.color] || "#555";
}

export function populateDestinationSelect(selectEl: HTMLSelectElement, placeholder?: string): void {
  const defaultOpt = document.createElement("option");
  defaultOpt.value = "";
  defaultOpt.textContent = placeholder || "Select destination...";
  selectEl.replaceChildren(defaultOpt);
  for (const d of cached) {
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = d.icon ? `${d.icon} ${d.name}` : d.name;
    selectEl.appendChild(opt);
  }
}
