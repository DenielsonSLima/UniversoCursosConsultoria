import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [page, progress] = await Promise.all([
  readFile(new URL('./ConsultaApiBaneseConfig.tsx', import.meta.url), 'utf8'),
  readFile(new URL('./BaneseAutopilotProgress.tsx', import.meta.url), 'utf8'),
]);

test('a página delega o progresso automático ao componente isolado', () => {
  assert.match(page, /import BaneseAutopilotProgress from '\.\/BaneseAutopilotProgress'/);
  assert.match(page, /<BaneseAutopilotProgress config=\{config\} autopilot=\{autopilot\} \/>/);
});

test('cooldown futuro interrompe a leitura visual de minutos estáveis', () => {
  assert.match(progress, /config\.state === 'COOLDOWN'/);
  assert.match(progress, /Number\.isFinite\(cooldownUntilMs\)/);
  assert.match(progress, /cooldownUntilMs > Date\.now\(\)/);
  assert.match(progress, /if \(cooldownActive\) \{/);

  const cooldownBranch = progress.indexOf('if (cooldownActive)');
  const stableMinutesLabel = progress.indexOf('/60 min estáveis');
  assert.ok(cooldownBranch >= 0 && stableMinutesLabel > cooldownBranch);
  assert.doesNotMatch(progress.slice(cooldownBranch, stableMinutesLabel), /\/60 min estáveis/);
  assert.doesNotMatch(progress, /useEffect/);
});

test('cooldown informa pausa, retomada e horário final de forma acessível', () => {
  assert.match(progress, /Nenhum novo título é reservado durante este período\./);
  assert.match(progress, /A contagem de 60 minutos estáveis[\s\S]+recomeça do zero na retomada da escada automática P3 → P6/);
  assert.match(progress, /Resfriamento até/);
  assert.match(progress, /<time dateTime=\{cooldownUntil \|\| undefined\}>/);
  assert.match(progress, /role="status"/);
  assert.match(progress, /aria-live="polite"/);
});

test('cópias delimitam a escada automática entre o piso P3 e o teto P6', () => {
  assert.match(page, /Automático P3 → P6/);
  assert.match(page, /piso P3 e o teto P6/);
  assert.match(page, /P1–P2 e P7–P20 permanecem disponíveis somente no modo manual/);
  assert.match(page, /if \(value === 'AUTOMATIC'\) setDraftProfile\(6\)/);
  assert.match(progress, /Teto automático P6 alcançado/);
  assert.doesNotMatch(page, /O teto é P10/);
  assert.doesNotMatch(page, /setDraftProfile\(9\)/);
  assert.doesNotMatch(page, /setDraftProfile\(10\)/);
});

test('perfis conservadores fora da escada não parecem depender de retorno do Banese', () => {
  assert.match(page, /profile\.group_name === 'CONSERVATIVE'[\s\S]+\? 'Somente manual'/);
  assert.match(page, /profile\.group_name === 'PRIORITY_WINDOW'[\s\S]+\? 'EAD \+ vencimento'/);
  assert.match(page, /: 'Aguardando Banese'/);
});

test('progresso ativo mantém barras com semântica acessível', () => {
  assert.match(progress, /role="progressbar"/);
  assert.match(progress, /aria-label="Progresso de títulos válidos"/);
  assert.match(progress, /aria-label="Progresso do período estável"/);
  assert.match(progress, /aria-valuemax=\{autopilot\.requiredTitles\}/);
  assert.match(progress, /aria-valuemax=\{autopilot\.requiredSeconds\}/);
});
