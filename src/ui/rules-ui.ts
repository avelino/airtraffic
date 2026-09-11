import type { Rule, RulesUIOptions } from "../core/types";
import { MATCH_TYPE_CONFIG } from "../core/constants";
import { getDestinationColor, getDestinationName } from "./destinations";
import { saveRulesToStorage } from "../core/storage";

interface RulesState {
  editingRuleId: string | null;
  allRules: Rule[];
  draggedItem: HTMLElement | null;
  draggedIndex: number;
  rulesList: HTMLUListElement | null;
  patternInput: HTMLInputElement | null;
  matchTypeSelect: HTMLSelectElement | null;
  destinationSelect: HTMLSelectElement | null;
  submitBtn: HTMLButtonElement | null;
  cancelBtn: HTMLButtonElement | null;
  matchHint: HTMLElement | null;
  form: HTMLFormElement | null;
  negateCheckbox: HTMLInputElement | null;
  colorMap: Record<string, string>;
  onRulesChanged: (() => void) | null;
}

const state: RulesState = {
  editingRuleId: null,
  allRules: [],
  draggedItem: null,
  draggedIndex: -1,
  rulesList: null,
  patternInput: null,
  matchTypeSelect: null,
  destinationSelect: null,
  submitBtn: null,
  cancelBtn: null,
  matchHint: null,
  form: null,
  negateCheckbox: null,
  colorMap: {},
  onRulesChanged: null,
};

function updateMatchHints(): void {
  if (!state.matchTypeSelect || !state.patternInput || !state.matchHint) return;
  const config = MATCH_TYPE_CONFIG[state.matchTypeSelect.value];
  if (!config) return;
  state.patternInput.placeholder = config.placeholder;
  const negated = state.negateCheckbox?.checked;
  state.matchHint.textContent = negated ? `Matches everything EXCEPT: ${config.hint}` : config.hint;
}

function cancelRuleEdit(): void {
  state.editingRuleId = null;
  if (state.patternInput) state.patternInput.value = "";
  if (state.matchTypeSelect) state.matchTypeSelect.value = "domain";
  if (state.destinationSelect) state.destinationSelect.value = "";
  if (state.submitBtn) state.submitBtn.textContent = "Add Rule";
  if (state.cancelBtn) state.cancelBtn.hidden = true;
  if (state.negateCheckbox) state.negateCheckbox.checked = false;
  updateMatchHints();
}

function startRuleEdit(rule: Rule): void {
  state.editingRuleId = rule.id;
  if (state.patternInput) state.patternInput.value = rule.pattern;
  if (state.matchTypeSelect) state.matchTypeSelect.value = rule.matchType;
  if (state.destinationSelect) state.destinationSelect.value = rule.destinationId;
  if (state.negateCheckbox) state.negateCheckbox.checked = rule.negate || false;
  if (state.submitBtn) state.submitBtn.textContent = "Save";
  if (state.cancelBtn) state.cancelBtn.hidden = false;
  updateMatchHints();
  state.patternInput?.focus();
  state.patternInput?.scrollIntoView?.({ behavior: "smooth", block: "center" });
}

async function deleteRuleById(id: string): Promise<void> {
  state.allRules = state.allRules.filter((r) => r.id !== id);
  if (state.editingRuleId === id) cancelRuleEdit();
  await saveRulesToStorage(state.allRules);
  renderRulesList(state.allRules);
  state.onRulesChanged?.();
}

export function initRulesUI(opts: RulesUIOptions): void {
  state.rulesList = opts.rulesList;
  state.patternInput = opts.patternInput;
  state.matchTypeSelect = opts.matchTypeSelect;
  state.destinationSelect = opts.destinationSelect;
  state.submitBtn = opts.submitBtn;
  state.cancelBtn = opts.cancelBtn;
  state.matchHint = opts.matchHint;
  state.form = opts.form;
  state.negateCheckbox = opts.negateCheckbox || null;
  state.colorMap = opts.colorMap;
  state.onRulesChanged = opts.onRulesChanged || null;

  state.matchTypeSelect.addEventListener("change", updateMatchHints);
  if (state.negateCheckbox) state.negateCheckbox.addEventListener("change", updateMatchHints);
  state.cancelBtn.addEventListener("click", cancelRuleEdit);

  state.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pattern = state.patternInput!.value.trim();
    const matchType = state.matchTypeSelect!.value;
    const destinationId = state.destinationSelect!.value;
    if (!pattern || !destinationId) return;

    const negate = state.negateCheckbox?.checked || false;

    if (state.editingRuleId) {
      const rule = state.allRules.find((r) => r.id === state.editingRuleId);
      if (rule) {
        rule.pattern = pattern;
        rule.matchType = matchType as Rule["matchType"];
        rule.destinationId = destinationId;
        rule.negate = negate || undefined;
      }
      cancelRuleEdit();
    } else {
      state.allRules.push({
        id: crypto.randomUUID(),
        pattern,
        matchType: matchType as Rule["matchType"],
        destinationId,
        ...(negate ? { negate: true } : {}),
      });
      state.patternInput!.value = "";
    }

    await saveRulesToStorage(state.allRules);
    renderRulesList(state.allRules);
    state.onRulesChanged?.();
  });

  updateMatchHints();
}

export function setRules(rules: Rule[]): void {
  state.allRules = rules;
}

export function getRules(): Rule[] {
  return state.allRules;
}

export function renderRulesList(rules: Rule[]): void {
  const list = state.rulesList;
  if (!list) return;
  list.replaceChildren();

  rules.forEach((rule, index) => {
    const li = document.createElement("li");
    li.className = "rule-item";
    li.draggable = true;
    li.dataset.index = String(index);

    const handle = document.createElement("span");
    handle.className = "drag-handle";
    handle.textContent = "☰";

    const info = document.createElement("div");
    info.className = "rule-info";

    const pattern = document.createElement("span");
    pattern.className = "rule-pattern";
    pattern.textContent = rule.pattern;

    const meta = document.createElement("span");
    meta.className = "rule-meta";
    const label = MATCH_TYPE_CONFIG[rule.matchType]?.label || rule.matchType;
    meta.textContent = rule.negate ? `NOT ${label}` : label;

    info.appendChild(pattern);
    info.appendChild(meta);

    const badge = document.createElement("span");
    badge.className = "container-badge";
    badge.style.backgroundColor = getDestinationColor(rule.destinationId, state.colorMap);
    badge.textContent = getDestinationName(rule.destinationId);

    const actions = document.createElement("div");
    actions.className = "rule-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "edit-btn";
    editBtn.textContent = "✎";
    editBtn.title = "Edit";
    editBtn.addEventListener("click", () => startRuleEdit(rule));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.textContent = "×";
    deleteBtn.title = "Delete";
    deleteBtn.addEventListener("click", () => deleteRuleById(rule.id));

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    li.appendChild(handle);
    li.appendChild(info);
    li.appendChild(badge);
    li.appendChild(actions);

    li.addEventListener("dragstart", (e) => {
      state.draggedItem = li;
      state.draggedIndex = index;
      li.classList.add("dragging");
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    });

    li.addEventListener("dragend", () => {
      li.classList.remove("dragging");
      list.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
      state.draggedItem = null;
    });

    li.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      if (state.draggedItem && state.draggedItem !== li) li.classList.add("drag-over");
    });

    li.addEventListener("dragleave", () => li.classList.remove("drag-over"));

    li.addEventListener("drop", async (e) => {
      e.preventDefault();
      li.classList.remove("drag-over");
      const targetIndex = parseInt(li.dataset.index || "0");
      if (state.draggedIndex === targetIndex) return;
      const [moved] = state.allRules.splice(state.draggedIndex, 1);
      if (!moved) return;
      state.allRules.splice(targetIndex, 0, moved);
      await saveRulesToStorage(state.allRules);
      renderRulesList(state.allRules);
      state.onRulesChanged?.();
    });

    list.appendChild(li);
  });
}
