import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const baseDir = resolve(
  process.cwd(),
  "modules/gestor/gestao/tecnicos/detalhes/components/financeiro",
);

const dialogSource = readFileSync(
  resolve(baseDir, "FinanceiroCicloManualDialog.tsx"),
  "utf8",
);
const progressSource = readFileSync(
  resolve(baseDir, "FinanceiroCicloManualIssuanceProgress.tsx"),
  "utf8",
);
const toastSource = readFileSync(
  resolve(
    baseDir,
    "../../../../../parceiros/components/shared/ToastNotification.tsx",
  ),
  "utf8",
);

test("a emissão pendente substitui o wizard por uma tela cheia de progresso", () => {
  assert.match(
    dialogSource,
    /pending\s*\?\s*\(\s*<FinanceiroCicloManualIssuanceProgress/,
  );
  assert.match(dialogSource, /aria-busy=\{pending\}/);
  assert.match(progressSource, /data-testid="manual-cycle-issuance-progress"/);
  assert.match(progressSource, /role="status"/);
  assert.match(progressSource, /aria-live="polite"/);
  assert.doesNotMatch(progressSource, /<button\b|onClose/);
});

test("a prévia revisada é preservada antes do início da mutation", () => {
  assert.match(
    dialogSource,
    /setIssuanceSnapshot\(preview\);\s*void onConfirm\(preview, firstDueDate\)/,
  );
  assert.match(
    dialogSource,
    /issuanceSnapshot\?\.cicloNumero[\s\S]*?issuanceSnapshot\?\.quantidadeItens[\s\S]*?issuanceSnapshot\?\.total/,
  );
  assert.doesNotMatch(dialogSource, /\?\?\s*(?:1|13)\}/);
  assert.match(dialogSource, /if \(pending\) dialogRef\.current\?\.focus\(\)/);
});

test("uma trava síncrona impede dois envios antes do estado pending renderizar", () => {
  assert.match(dialogSource, /const issuanceStartedRef = useRef\(false\)/);
  assert.match(
    dialogSource,
    /if \(!preview \|\| issuanceStartedRef\.current\) return;/,
  );
  assert.match(dialogSource, /issuanceStartedRef\.current = true;/);
  assert.match(dialogSource, /onClick=\{startIssuance\}/);
  assert.match(
    dialogSource,
    /onConfirm\(preview, firstDueDate\)\.finally\(\(\) => \{\s*issuanceStartedRef\.current = false;/,
  );
});

test("a barra é indeterminada e não inventa percentual do Banese", () => {
  const progressBar = progressSource.match(
    /<div\s+role="progressbar"[\s\S]*?<\/div>/,
  )?.[0] || "";
  assert.match(progressBar, /aria-label="Geração e emissão BolePix em andamento"/);
  assert.match(progressBar, /aria-valuetext=/);
  assert.doesNotMatch(progressBar, /aria-valuenow|aria-valuemin|aria-valuemax/);
  assert.doesNotMatch(progressBar, /elapsedSeconds/);
  assert.match(progressSource, /não representa um percentual estimado/i);
  assert.match(progressSource, /animate-pulse/);
  assert.match(progressSource, /motion-reduce:animate-none/);
});

test("a tela explica as três etapas reais e o resultado esperado", () => {
  for (
    const label of [
      "Preparar cobranças",
      "Emitir no Banese",
      "Conferir o retorno",
      "Pix, linha digitável e código de barras",
      "protegida contra duplicidade",
      "indicará como retomar com segurança",
    ]
  ) {
    assert.match(progressSource, new RegExp(label, "i"));
  }
  assert.match(progressSource, /quantidadeItens/);
  assert.match(progressSource, /formatMoney\(total\)/);
});

test("o tempo decorrido é real, limpo no unmount e anunciado sem ruído", () => {
  assert.match(progressSource, /Date\.now\(\)/);
  assert.match(progressSource, /window\.setInterval\(updateElapsed, 1_000\)/);
  assert.match(progressSource, /window\.clearInterval\(intervalId\)/);
  assert.match(progressSource, /formatElapsed\(elapsedSeconds\)/);
  assert.match(progressSource, /aria-label=\{`\$\{elapsedSeconds\} segundos decorridos`\}/);
  const liveRegion = progressSource.match(
    /<p role="status"[\s\S]*?<\/p>/,
  )?.[0] || "";
  assert.match(liveRegion, /Emissão BolePix iniciada/);
  assert.doesNotMatch(liveRegion, /elapsedSeconds|formatElapsed/);
});

test("interrupções exibem o toast visual de alerta em vez de falhar em runtime", () => {
  assert.match(toastSource, /ToastType = [^;]*['"]warning['"]/);
  assert.match(toastSource, /warning:\s*\{[\s\S]*?border-l-amber-500/);
  assert.match(toastSource, /addToast\(['"]warning['"]/);
});
