import type { Engine } from "../core/engine";
import { loadDestinationList, populateDestinationSelect } from "./destinations";
import { initRulesUI, setRules, renderRulesList } from "./rules-ui";
import { loadSettingsFromStorage, loadRulesFromStorage } from "../core/storage";

export async function runPopup(engine: Engine): Promise<void> {
  const destinationSelect = document.getElementById("destination-select") as HTMLSelectElement;

  initRulesUI({
    rulesList: document.getElementById("rules-list") as HTMLUListElement,
    patternInput: document.getElementById("pattern-input") as HTMLInputElement,
    matchTypeSelect: document.getElementById("match-type-select") as HTMLSelectElement,
    destinationSelect,
    submitBtn: document.getElementById("submit-btn") as HTMLButtonElement,
    cancelBtn: document.getElementById("cancel-btn") as HTMLButtonElement,
    matchHint: document.getElementById("match-hint") as HTMLElement,
    form: document.getElementById("add-rule-form") as HTMLFormElement,
    negateCheckbox: document.getElementById("negate-checkbox") as HTMLInputElement,
    colorMap: engine.colors,
  });

  document.getElementById("open-settings")!.addEventListener("click", (e) => {
    e.preventDefault();
    browser.runtime.openOptionsPage();
  });

  await loadDestinationList(engine);
  populateDestinationSelect(destinationSelect);
  await loadSettingsFromStorage();
  const rules = await loadRulesFromStorage();
  setRules(rules);
  renderRulesList(rules);
}
