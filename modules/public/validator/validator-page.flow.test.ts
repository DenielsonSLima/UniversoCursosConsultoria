import assert from 'node:assert/strict';
import {
  createLatestValidationRequestGuard,
  normalizePublicValidationCode,
  resolvePublicValidationCodeFromSearchParams,
} from './validator-page.flow.ts';

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

Deno.test('normaliza o código público antes de consultar ou exibir', () => {
  assert.equal(
    normalizePublicValidationCode('  pas ta-44 \n curs-alun-2026  '),
    'PASTA-44CURS-ALUN-2026',
  );
});

Deno.test('query canônica prevalece e o parâmetro legado continua compatível', () => {
  assert.equal(
    resolvePublicValidationCodeFromSearchParams(
      new URLSearchParams('q=qr-atual-2026&code=legado-2025'),
    ),
    'QR-ATUAL-2026',
  );
  assert.equal(
    resolvePublicValidationCodeFromSearchParams(
      new URLSearchParams('q=%20%20&code=legado-2025'),
    ),
    'LEGADO-2025',
  );
  assert.equal(
    resolvePublicValidationCodeFromSearchParams(new URLSearchParams()),
    '',
  );
});

Deno.test('somente a requisição de validação mais recente pode concluir', () => {
  const guard = createLatestValidationRequestGuard();
  guard.activate();

  const oldRequest = guard.begin();
  const latestRequest = guard.begin();

  assert.equal(guard.canCommit(oldRequest), false);
  assert.equal(guard.canCommit(latestRequest), true);
});

Deno.test('resposta antiga resolvida por último não sobrescreve a consulta nova', async () => {
  const guard = createLatestValidationRequestGuard();
  guard.activate();
  const committedResults: string[] = [];
  let resolveOldRequest: (value: string) => void = () => undefined;
  let resolveLatestRequest: (value: string) => void = () => undefined;
  const oldResult = new Promise<string>((resolve) => {
    resolveOldRequest = resolve;
  });
  const latestResult = new Promise<string>((resolve) => {
    resolveLatestRequest = resolve;
  });
  const oldRequestId = guard.begin();
  const oldCommit = oldResult.then((value) => {
    if (guard.canCommit(oldRequestId)) committedResults.push(value);
  });
  const latestRequestId = guard.begin();
  const latestCommit = latestResult.then((value) => {
    if (guard.canCommit(latestRequestId)) committedResults.push(value);
  });

  resolveLatestRequest('novo');
  await latestCommit;
  resolveOldRequest('antigo');
  await oldCommit;

  assert.deepEqual(committedResults, ['novo']);
});

Deno.test('edição do código cancela a validação pendente', () => {
  const guard = createLatestValidationRequestGuard();
  guard.activate();

  const pendingRequest = guard.begin();
  guard.cancel();

  assert.equal(guard.canCommit(pendingRequest), false);
});

Deno.test('unmount impede atualização tardia e remontagem reativa o guardião', () => {
  const guard = createLatestValidationRequestGuard();
  guard.activate();

  const requestBeforeUnmount = guard.begin();
  guard.deactivate();
  assert.equal(guard.canCommit(requestBeforeUnmount), false);

  guard.activate();
  const requestAfterRemount = guard.begin();
  assert.equal(guard.canCommit(requestAfterRemount), true);
});

Deno.test('página possui contrato mínimo de formulário e anúncios acessíveis', async () => {
  const pageSource = await Deno.readTextFile(
    new URL('./ValidatorPage.tsx', import.meta.url),
  );

  assert.match(pageSource, /htmlFor="document-validation-code"/);
  assert.match(pageSource, /autoComplete="off"/);
  assert.match(pageSource, /autoCapitalize="characters"/);
  assert.match(pageSource, /spellCheck=\{false\}/);
  assert.match(pageSource, /role="status"/);
  assert.match(pageSource, /role="alert"/);
  assert.match(pageSource, /role="region"/);
  assert.match(pageSource, /tabIndex=\{-1\}/);
  assert.match(pageSource, /validatorService\.validate\(normalizedCode\)/);
  assert.doesNotMatch(pageSource, /\$\{inputCode\}/);
  assert.doesNotMatch(pageSource, /\$\{code\}/);
  assert.doesNotMatch(pageSource, /error\.message/);
  assert.doesNotMatch(pageSource, /console\.error\([^)]*,\s*error/);
});

Deno.test('troca da URL limpa resultado antigo antes de uma nova validação', async () => {
  const pageSource = await Deno.readTextFile(
    new URL('./ValidatorPage.tsx', import.meta.url),
  );

  assert.match(
    pageSource,
    /useEffect\(\(\) => \{\s+requestGuard\.cancel\(\);\s+setCode\(urlCode\);\s+setStatus\('idle'\);\s+setResult\(null\);/,
  );
  assert.match(pageSource, /if \(urlCode\.length < 5\) return;/);
});

Deno.test('App expõe a rota canônica e o alias inglês preserva a query', async () => {
  const appSource = await Deno.readTextFile(
    new URL('../../../App.tsx', import.meta.url),
  );

  assert.match(appSource, /path="\/validador" element=\{<ValidatorPage \/>/);
  assert.match(
    appSource,
    /path="\/validator" element=\{<Navigate to=\{`\/validador\$\{window\.location\.search\}`\} replace \/>/,
  );
});
