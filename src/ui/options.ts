import type { Engine } from "../core/engine";
import type { Destination } from "../core/types";
import {
  loadDestinationList,
  getDestinations,
  getDestinationName,
  populateDestinationSelect,
} from "./destinations";
import { initRulesUI, setRules, getRules, renderRulesList } from "./rules-ui";
import {
  loadSettingsFromStorage,
  saveSettingsToStorage,
  loadRulesFromStorage,
  saveRulesToStorage,
  migrateStorageArea,
  migrateRuleSchema,
  migrateSettingsSchema,
  getSettings,
} from "../core/storage";

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

/** Rules list, add/edit form and the filter box. */
function initRulesPanel(engine: Engine): void {
  const rulesSearch = el<HTMLInputElement>("rules-search");
  const rulesEmpty = el("rules-empty");

  initRulesUI({
    rulesList: el<HTMLUListElement>("rules-list"),
    patternInput: el<HTMLInputElement>("pattern-input"),
    matchTypeSelect: el<HTMLSelectElement>("match-type-select"),
    destinationSelect: el<HTMLSelectElement>("destination-select"),
    submitBtn: el<HTMLButtonElement>("submit-btn"),
    cancelBtn: el<HTMLButtonElement>("cancel-btn"),
    matchHint: el("match-hint"),
    form: el<HTMLFormElement>("add-rule-form"),
    negateCheckbox: el<HTMLInputElement>("negate-checkbox"),
    colorMap: engine.colors,
    onRulesChanged: () => {
      rulesEmpty.hidden = getRules().length > 0;
    },
  });

  rulesSearch.addEventListener("input", () => {
    const query = rulesSearch.value.toLowerCase().trim();
    const all = getRules();
    const filtered = query
      ? all.filter(
          (r) =>
            r.pattern.toLowerCase().includes(query) ||
            getDestinationName(r.destinationId).toLowerCase().includes(query),
        )
      : all;
    renderRulesList(filtered);
  });
}

interface DestinationsPanel {
  /** Reloads destinations from the engine and repaints everything that shows them. */
  refresh(): Promise<void>;
  /** Bootstrap paint: fills the colour/icon pickers and both destination selects. */
  paint(): void;
}

/** The "Destinations" card: colour/icon pickers, the list, and its CRUD form. */
function initDestinationsPanel(engine: Engine): DestinationsPanel {
  const colorMap = engine.colors;
  const iconMap = engine.icons;

  const destinationSelect = el<HTMLSelectElement>("destination-select");
  const defaultDestinationSelect = el<HTMLSelectElement>("default-destination-select");
  const form = el<HTMLFormElement>("destination-form");
  const nameInput = el<HTMLInputElement>("destination-name-input");
  const colorSelect = el<HTMLSelectElement>("destination-color-select");
  const iconSelectWrap = el("icon-select-wrap");
  const iconSelect = el<HTMLSelectElement>("destination-icon-select");
  const submitBtn = el<HTMLButtonElement>("destination-submit-btn");
  const cancelBtn = el<HTMLButtonElement>("destination-cancel-btn");
  const list = el<HTMLUListElement>("destinations-list");

  let editingId: string | null = null;

  iconSelectWrap.hidden = !iconMap;

  function populateColorSelect(): void {
    colorSelect.replaceChildren();
    for (const name of Object.keys(colorMap)) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name.charAt(0).toUpperCase() + name.slice(1);
      colorSelect.appendChild(opt);
    }
  }

  function populateIconSelect(): void {
    if (!iconMap) return;
    iconSelect.replaceChildren();
    for (const [value, emoji] of Object.entries(iconMap)) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = `${emoji} ${value}`;
      iconSelect.appendChild(opt);
    }
  }

  function renderList(): void {
    list.replaceChildren();
    for (const d of getDestinations()) {
      const li = document.createElement("li");
      li.className = "container-item";

      const dot = document.createElement("span");
      dot.className = "container-color-dot";
      dot.style.backgroundColor = colorMap[d.color] || "#555";

      const icon = document.createElement("span");
      icon.className = "container-item-icon";
      icon.textContent = (iconMap && d.icon && iconMap[d.icon]) || "";

      const name = document.createElement("span");
      name.className = "container-item-name";
      name.textContent = d.name;

      const actions = document.createElement("div");
      actions.className = "rule-actions";

      const editBtn = document.createElement("button");
      editBtn.className = "edit-btn";
      editBtn.textContent = "✎";
      editBtn.title = "Edit";
      editBtn.addEventListener("click", () => startEdit(d));

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "delete-btn";
      deleteBtn.textContent = "×";
      deleteBtn.title = "Delete";
      deleteBtn.addEventListener("click", () => remove(d.id));

      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);

      li.appendChild(dot);
      li.appendChild(icon);
      li.appendChild(name);
      li.appendChild(actions);
      list.appendChild(li);
    }
  }

  function startEdit(d: Destination): void {
    editingId = d.id;
    nameInput.value = d.name;
    colorSelect.value = d.color;
    if (iconMap) iconSelect.value = d.icon || Object.keys(iconMap)[0]!;
    submitBtn.textContent = "Save";
    cancelBtn.hidden = false;
    nameInput.focus();
  }

  function cancelEdit(): void {
    editingId = null;
    nameInput.value = "";
    colorSelect.selectedIndex = 0;
    if (iconMap) iconSelect.selectedIndex = 0;
    submitBtn.textContent = "Create";
    cancelBtn.hidden = true;
  }

  async function remove(id: string): Promise<void> {
    const message =
      engine.id === "firefox"
        ? "Delete this container? Every tab currently open in it will be closed, and tabs will no longer be routed there."
        : "Delete this destination? Tabs routed to it will no longer be grouped automatically.";
    if (!confirm(message)) return;
    await engine.deleteDestination(id);
    if (editingId === id) cancelEdit();
    await refresh();
  }

  function populateSelects(): void {
    populateDestinationSelect(destinationSelect, "Destination...");
    populateDestinationSelect(defaultDestinationSelect, "Select...");
  }

  async function refresh(): Promise<void> {
    await loadDestinationList(engine);
    populateSelects();
    renderList();
    renderRulesList(getRules());
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;

    const color = colorSelect.value;
    const icon = iconMap ? iconSelect.value : undefined;

    if (editingId) {
      await engine.updateDestination(editingId, { name, color, icon });
      cancelEdit();
    } else {
      await engine.createDestination({ name, color, icon });
      nameInput.value = "";
    }

    await refresh();
  });

  cancelBtn.addEventListener("click", cancelEdit);

  return {
    refresh,
    paint: () => {
      populateColorSelect();
      populateIconSelect();
      populateSelects();
      renderList();
    },
  };
}

/** The "Settings" card: routing mode, default destination, sync toggle. */
function initSettingsPanel(): { apply: () => Promise<void> } {
  const modeSelect = el<HTMLSelectElement>("mode-select");
  const defaultDestinationRow = el("default-destination-row");
  const defaultDestinationSelect = el<HTMLSelectElement>("default-destination-select");
  const syncToggle = el<HTMLInputElement>("sync-toggle");

  async function apply(): Promise<void> {
    const s = await loadSettingsFromStorage();
    modeSelect.value = s.mode;
    syncToggle.checked = s.useSync;
    defaultDestinationSelect.value = s.defaultDestinationId;
    defaultDestinationRow.hidden = s.mode !== "route_all";
  }

  modeSelect.addEventListener("change", () => {
    defaultDestinationRow.hidden = modeSelect.value !== "route_all";
    saveSettingsToStorage({ mode: modeSelect.value as "route_matched" | "route_all" });
  });

  defaultDestinationSelect.addEventListener("change", () => {
    saveSettingsToStorage({ defaultDestinationId: defaultDestinationSelect.value });
  });

  syncToggle.addEventListener("change", async () => {
    const wasSync = getSettings().useSync;
    const nowSync = syncToggle.checked;
    if (wasSync !== nowSync) await migrateStorageArea(wasSync, nowSync);
    await saveSettingsToStorage({ useSync: nowSync });
    const rules = await loadRulesFromStorage();
    setRules(rules);
    renderRulesList(rules);
  });

  return { apply };
}

/** The "Data" card: export to JSON, import from JSON (migrating old formats). */
function initDataPanel(applySettings: () => Promise<void>): void {
  const exportBtn = el<HTMLButtonElement>("export-btn");
  const importBtn = el<HTMLButtonElement>("import-btn");
  const importFile = el<HTMLInputElement>("import-file");
  const rulesEmpty = el("rules-empty");

  exportBtn.addEventListener("click", async () => {
    const rules = await loadRulesFromStorage();
    const s = await loadSettingsFromStorage();

    const blob = new Blob([JSON.stringify({ version: 2, rules, settings: s }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "air-traffic-rules.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  importBtn.addEventListener("click", () => importFile.click());

  importFile.addEventListener("change", async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      const data = JSON.parse(await file.text());

      if (!Array.isArray(data.rules)) {
        alert("Invalid file: no rules found.");
        return;
      }

      data.rules = data.rules.map(migrateRuleSchema);

      for (const rule of data.rules) {
        if (!rule.pattern || !rule.matchType || !rule.destinationId) {
          alert("Invalid file: rules are missing required fields.");
          return;
        }
        if (!rule.id) rule.id = crypto.randomUUID();
      }

      await saveRulesToStorage(data.rules);
      if (data.settings) {
        // useSync is a per-device preference, not portable data: importing it
        // would point reads at a storage area the rules were not written to.
        const { useSync: _useSync, ...portable } = migrateSettingsSchema(data.settings);
        await saveSettingsToStorage(portable);
        await applySettings();
      }

      setRules(data.rules);
      renderRulesList(data.rules);
      rulesEmpty.hidden = data.rules.length > 0;
    } catch {
      alert("Failed to import: invalid JSON file.");
    }

    importFile.value = "";
  });
}

export async function runOptions(engine: Engine): Promise<void> {
  const rulesEmpty = el("rules-empty");

  initRulesPanel(engine);
  const destinations = initDestinationsPanel(engine);
  const settings = initSettingsPanel();
  initDataPanel(settings.apply);

  await loadDestinationList(engine);
  destinations.paint();
  await settings.apply();

  const rules = await loadRulesFromStorage();
  setRules(rules);
  renderRulesList(rules);
  rulesEmpty.hidden = rules.length > 0;
}
