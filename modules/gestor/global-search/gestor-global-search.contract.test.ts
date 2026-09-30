import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');
const [ui, hook, service, navigation, card, filters, list] = await Promise.all([
  readSource('./GestorGlobalSearch.tsx'),
  readSource('../hooks/useGestorSearch.tsx'),
  readSource('./gestor-global-search.service.ts'),
  readSource('./useGestorGlobalSearchNavigation.ts'),
  readSource('../parceiros/components/cards/AlunoCard.tsx'),
  readSource('../parceiros/components/ParceirosFilters.tsx'),
  readSource('../parceiros/components/ParceirosList.tsx'),
]);

test('busca global usa RPC sem receber polo do cliente e cancela requisições obsoletas', () => {
  assert.match(service, /rpc\('search_gestor_global_entities_secure'/);
  assert.match(service, /p_search: term/);
  assert.match(service, /p_limit: GESTOR_GLOBAL_SEARCH_LIMIT/);
  assert.doesNotMatch(service, /p_polo|allowedPolo/);
  assert.match(service, /abortSignal\(signal\)/);
  assert.match(hook, /SEARCH_DEBOUNCE_MS = 320/);
  assert.match(hook, /\['gestor-global-search', accessKey, debouncedQuery\]/);
});

test('combobox expõe três linhas úteis e navegação por teclado', () => {
  assert.match(ui, /role="combobox"/);
  assert.match(ui, /role="listbox"/);
  assert.match(ui, /role="option"/);
  assert.match(ui, /ArrowDown/);
  assert.match(ui, /ArrowUp/);
  assert.match(ui, /formatGlobalSearchDocument/);
  assert.match(ui, /formatGlobalSearchPolo/);
  assert.match(ui, /Turma ·/);
  assert.match(ui, /Limpar busca global/);
  assert.match(ui, /scrollIntoView\(\{ block: 'nearest' \}\)/);
  assert.match(ui, /result\.photoUrl && !imageFailed/);
  assert.match(ui, /onError=\{\(\) => setImageFailed\(true\)\}/);
  assert.match(ui, /truncate text-\[12px\] font-extrabold/);
  assert.match(ui, /text-\[10px\] font-semibold text-slate-700/);
  assert.match(service, /photoUrl: row\.photo_url \|\| null/);
});

test('atalho troca o polo antes de abrir e protege cadastro já aberto', () => {
  assert.match(navigation, /await changePolo\(result\.poloId\)/);
  assert.ok(navigation.indexOf('await changePolo(result.poloId)') < navigation.indexOf("setActiveModule('parceiros'"));
  assert.match(navigation, /hasOpenPartnerDetails/);
  assert.match(navigation, /window\.confirm\('Deseja sair do cadastro atual e abrir outro/);
});

test('card do aluno prioriza identidade e filtros são controlados', () => {
  assert.match(card, /h-\[52px\] w-\[52px\]/);
  assert.match(card, /text-\[11px\] font-extrabold[^"']*antialiased/);
  assert.match(card, /tabular-nums text-slate-900/);
  assert.ok(card.indexOf('data.dataNascimento') < card.indexOf('data.nomeMae'));
  assert.doesNotMatch(card, /data\.poloNome|Turma:|matriculaAtual/);
  assert.match(filters, /value=\{searchTerm\}/);
  assert.match(filters, /value=\{statusFilter\}/);
  assert.match(filters, /value=\{sortOrder\}/);
  assert.match(filters, /aria-label="Limpar busca"/);
  assert.match(list, /}, \[items\]\);/);
});
