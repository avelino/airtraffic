# Air Traffic: suporte multi-engine (Firefox Containers + Chromium Tab Groups)

Status: aprovado para implementação
Data: 2026-09-10

## Contexto

Air Traffic hoje é uma extensão Firefox que roteia automaticamente URLs pra
containers (`contextualIdentities`) com base em regras de pattern matching.
Queremos dar suporte a Chromium/Chrome usando **Tab Groups** (`chrome.tabGroups`)
como mecanismo de organização — sem isolamento de cookies/sessão como um
container real, mas reaproveitando toda a engine de regras.

Restrição do usuário: **não duplicar lógica**. Precisa existir um core único
bem definido, com uma interface (`Engine`) implementada uma vez por browser.

## Objetivo

- Extrair um `core/` 100% livre de APIs de browser (pattern matching, resolução
  de rota, schema de storage + migração).
- Definir uma interface `Engine` que abstrai a única coisa que realmente
  difere entre Firefox e Chrome: como um "destino" existe, é criado, e como
  uma aba é movida pra ele.
- Duas implementações de `Engine` (`engines/firefox`, `engines/chrome`) e
  entrypoints finos por browser que amarram tudo.
- Dois manifests (MV3 nos dois) e dois targets de build (`dist/firefox`,
  `dist/chrome`).

## Fora de escopo

- Isolamento real de cookies/sessão no Chrome (tab group é só organização
  visual — decisão já validada com o usuário).
- Publicação nas lojas (Chrome Web Store / AMO) — só build + package local.
- Suporte a outros browsers (Edge, Safari) — a interface `Engine` deixa
  aberto pra depois, mas não é implementado agora.

## Decisões já validadas com o usuário

1. **Manifest V3 nas duas engines** (não manter Firefox em V2). Firefox MV3
   aceita `background.scripts` como event page (não precisa virar service
   worker de fato); Chrome exige `background.service_worker`.
2. **Rule schema generalizado**: `cookieStoreId` → `destinationId`,
   `Settings.defaultContainer` → `Settings.defaultDestinationId`. Migração
   automática e idempotente no load do storage, nas duas engines (usuários
   Firefox existentes também têm dados no formato antigo).
3. **Destinos declarados no core, materializados sob demanda no Chrome**: o
   usuário cadastra nome+cor do destino nas regras igual hoje faz com
   containers; no Chrome isso é metadado local até a primeira aba bater na
   regra, quando o group real é criado/reaproveitado por título.
4. **Group sempre na janela atual da aba** no Chrome — nunca move aba de
   janela pra consolidar um destino. Previsível, sem cross-window magic.

## Arquitetura

### Diretórios

```
src/
  core/                        # zero import de browser.* / chrome.*
    types.ts                   # Rule, Settings, Destination, NewDestination, RouteResult
    pattern-matcher.ts          # inalterado (já é puro)
    route-resolver.ts           # inalterado na lógica, campo renomeado
    storage.ts                  # rules/settings + migração de schema
  engines/
    firefox/
      index.ts                  # FirefoxEngine implements Engine
    chrome/
      index.ts                  # ChromeEngine implements Engine
      group-planner.ts          # função pura: reuse vs create group
      colors.ts                 # paleta fixa de cor do Chrome tab group
      polyfill.ts                # side-effect: globalThis.browser = webextension-polyfill
  ui/                            # recebe um Engine por parâmetro, nunca importa browser.*/chrome.* diretamente
    background.ts
    popup.ts
    options.ts
    rules-ui.ts                  # generalizado: "destination" em vez de "container"
  entrypoints/
    firefox/{background,popup,options}.ts
    chrome/{background,popup,options}.ts
manifests/
  firefox.json
  chrome.json
```

Arquivos removidos/absorvidos: `src/shared/containers.ts` (vira parte da
`FirefoxEngine`), `src/route-resolver.ts` e `src/pattern-matcher.ts` (movem
pra `core/` sem mudança de lógica).

### Interface `Engine`

```ts
export interface Destination {
  id: string;
  name: string;
  color: string;
  icon?: string; // só Firefox usa
}

export type NewDestination = Omit<Destination, "id">;

export interface EngineTab {
  id: number;
  url?: string;
  windowId: number;
  index: number;
  active: boolean;
}

export interface Engine {
  readonly id: "firefox" | "chrome";
  listDestinations(): Promise<Destination[]>;
  createDestination(input: NewDestination): Promise<Destination>;
  updateDestination(id: string, patch: Partial<NewDestination>): Promise<void>;
  deleteDestination(id: string): Promise<void>;
  currentDestinationId(tab: EngineTab): Promise<string>; // "" = nenhum
  applyRoute(tab: EngineTab, destinationId: string): Promise<void>;
  openInDestination(url: string, destinationId: string, refTab: EngineTab): Promise<void>;
  onDestinationsChanged(cb: () => void): void;
}
```

Tudo que já é comum nas duas engines em Manifest V3 (`browser.storage.*`,
`browser.action.*` pra badge, `browser.contextMenus.*`, `browser.tabs.onUpdated`)
**fica fora da interface** e vive direto em `ui/background.ts` — só entra na
interface o que é genuinamente divergente (destino existe como quê, e como
uma aba entra nele).

No Chrome, `globalThis.browser` é populado por `webextension-polyfill`
(novo devDependency), importado uma vez em `engines/chrome/polyfill.ts` e
puxado no topo de cada entrypoint Chrome. No Firefox, `browser` já é nativo.

### FirefoxEngine

- `listDestinations`: `browser.contextualIdentities.query({})` mapeado pra
  `Destination[]` (`id = cookieStoreId`).
- `createDestination/update/delete`: wrap direto de
  `contextualIdentities.create/update/remove`.
- `currentDestinationId(tab)`: `tab.cookieStoreId ?? ""`.
- `applyRoute(tab, destinationId)`: fluxo que já existe hoje —
  `tabs.create({url, cookieStoreId: destinationId, ...})` + `tabs.remove`
  da aba antiga, com tracking de `tabsInTransit` pra evitar loop.
- `openInDestination`: `tabs.create` direto com `cookieStoreId`.

### ChromeEngine

- `listDestinations`: lê array `destinations` do storage local (metadado
  próprio — nome, cor; sem `icon`).
- `createDestination/update/delete`: CRUD só nesse array em storage, sem
  efeito colateral no browser (o group real não existe ainda).
- `currentDestinationId(tab)`: se `tab.groupId` for ausente/`TAB_GROUP_ID_NONE`
  → `""`. Senão `browser.tabGroups.get(tab.groupId)` e casa `group.title`
  contra o nome de algum destino cacheado; sem match → `""`.
- `applyRoute(tab, destinationId)`:
  1. Resolve destino (nome, cor) via `listDestinations()`; se sumiu, `console.warn` e retorna (mirror do `containerExists` do Firefox).
  2. `plan = planGroupAction(await browser.tabGroups.query({ windowId: tab.windowId, title: destino.name }), destino.name)` — função pura em `group-planner.ts`.
  3. `plan.action === "reuse"` → `browser.tabs.group({ tabIds: [tab.id], groupId: plan.groupId })`.
  4. `plan.action === "create"` → `groupId = await browser.tabs.group({ tabIds: [tab.id] })`; `browser.tabGroups.update(groupId, { title: destino.name, color: destino.color })`.
  5. Sem criar/remover aba — cookies e sessão intocados.
- `openInDestination(url, destinationId, refTab)`: `newTab = await browser.tabs.create({url, active, index: refTab.index+1, windowId: refTab.windowId})` seguido de `applyRoute(newTab, destinationId)` (reuso direto).

`group-planner.ts` (função pura, testável sem mock de `chrome.tabGroups`):

```ts
export function planGroupAction(
  existingGroups: { id: number; title: string }[],
  destinationName: string,
): { action: "reuse"; groupId: number } | { action: "create" } {
  const match = existingGroups.find((g) => g.title === destinationName);
  return match ? { action: "reuse", groupId: match.id } : { action: "create" };
}
```

### Core: storage e migração

`core/storage.ts` mantém a API atual (`loadRulesFromStorage`,
`saveRulesToStorage`, `loadSettingsFromStorage`, `saveSettingsToStorage`,
`migrateRulesStorage` para sync↔local) e ganha uma migração de schema, que
roda uma vez ao carregar:

```ts
function migrateRuleSchema(raw: unknown): Rule {
  const r = raw as Record<string, unknown>;
  if (r.destinationId === undefined && r.cookieStoreId !== undefined) {
    r.destinationId = r.cookieStoreId;
    delete r.cookieStoreId;
  }
  return r as Rule;
}

function migrateSettingsSchema(raw: Settings & { defaultContainer?: string }): Settings {
  if (raw.defaultDestinationId === undefined && raw.defaultContainer !== undefined) {
    raw.defaultDestinationId = raw.defaultContainer;
    delete raw.defaultContainer;
  }
  return raw;
}
```

Idempotente (campo novo já presente → no-op). `destinations` é uma nova key
de storage, respeitando o mesmo toggle `useSync` que `rules` já usa hoje.

### UI compartilhada (`src/ui/`)

- `rules-ui.ts`: troca toda referência a "container" por "destination";
  `getContainerName/getContainerColor` → funções que recebem `Engine` e usam
  `engine.listDestinations()` (cacheado).
- `options.ts`: painel de "Containers" vira painel de "Destinations", CRUD
  chamando `engine.createDestination/update/delete`. Picker de ícone só
  renderiza quando `engine.id === "firefox"` (Chrome não suporta ícone em
  tab group — checagem direta, sem sistema de capabilities pra um único
  booleano).
- `background.ts`: cache de rules/settings, listener de `storage.onChanged`,
  `browser.tabs.onUpdated` chamando `resolveRoute` (core) +
  `engine.currentDestinationId` + `engine.applyRoute`; badge via
  `browser.action.*` (nome unificado em MV3); menu de contexto via
  `browser.contextMenus.*` + `engine.listDestinations()` +
  `engine.openInDestination()`.

### Entrypoints

Cada arquivo em `src/entrypoints/<engine>/*.ts` tem só a fiação:

```ts
// src/entrypoints/chrome/background.ts
import "../../engines/chrome/polyfill";
import { runBackground } from "../../ui/background";
import { chromeEngine } from "../../engines/chrome";

runBackground(chromeEngine);
```

```ts
// src/entrypoints/firefox/background.ts
import { runBackground } from "../../ui/background";
import { firefoxEngine } from "../../engines/firefox";

runBackground(firefoxEngine);
```

Mesma forma pra `popup.ts` e `options.ts`.

### Manifests e build

`manifests/firefox.json` e `manifests/chrome.json`, ambos MV3, com
`host_permissions: ["<all_urls>"]` separado de `permissions` (exigência MV3
nas duas engines). Diferenças reais: `permissions`
(`contextualIdentities` vs `tabGroups`), `background`
(`scripts` event page vs `service_worker`), `browser_specific_settings.gecko`
só no Firefox.

`build.mjs` ganha flag `--target=firefox|chrome` (builda os dois se omitido);
gera `dist/<target>` com o manifest e entrypoints certos. HTML/CSS de
popup/options continuam compartilhados (mesmo caminho relativo nos dois
dists).

`package.json`:
```
"build": "node build.mjs",
"build:firefox": "node build.mjs --target=firefox",
"build:chrome": "node build.mjs --target=chrome",
"package:firefox": "npm run build:firefox && web-ext build --source-dir dist/firefox --overwrite-dest --artifacts-dir web-ext-artifacts/firefox",
"package:chrome": "npm run build:chrome && (cd dist/chrome && zip -r ../../web-ext-artifacts/chrome/air-traffic-chrome.zip . -x '.*')"
```

Novo devDependency: `webextension-polyfill` (sem `@types/webextension-polyfill`
— mantém o padrão do projeto de `src/types/browser.d.ts` hand-rolled,
estendido com `tabGroups`, `tabs.group`, `contextMenus`).

## Testes

- Rename mecânico em `tests/route-resolver.test.ts` e
  `tests/pattern-matcher.test.ts`: `cookieStoreId` → `destinationId` (lógica
  não muda).
- Novo `tests/storage-migration.test.ts`: migração de `cookieStoreId` e
  `defaultContainer`, idempotência, no-op quando já migrado.
- Novo `tests/engines/chrome/group-planner.test.ts`: `planGroupAction` puro
  — reuse quando já existe group com o título, create quando não existe,
  case-sensitivity do título.

## Limite de verificação

Não há como carregar uma extensão unpacked em `about:debugging` (Firefox) ou
`chrome://extensions` (Chrome) via este ambiente. O smoke test final —
instalar `dist/firefox` e `dist/chrome` e confirmar que uma regra realmente
move a aba pro container/group certo — precisa ser feito manualmente pelo
usuário depois da implementação.

## Riscos / pontos de atenção

- `chrome.tabs.group()` pode falhar se a aba fechar durante a corrida
  (navegação rápida) — `try/catch` com `console.warn`, mesmo padrão já usado
  hoje pro Firefox.
- `browser.tabGroups.query({ title })` depende da API filtrar por título
  exato — se o comportamento real divergir da documentação, o fallback é
  filtrar client-side em `group-planner.ts` (já isolado e puro, fácil de
  ajustar sem tocar no resto).
