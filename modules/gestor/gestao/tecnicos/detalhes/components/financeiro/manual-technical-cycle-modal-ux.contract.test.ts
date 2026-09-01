import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const baseDir = resolve(
  process.cwd(),
  "modules/gestor/gestao/tecnicos/detalhes/components/financeiro",
);

const readSource = (relativePath: string) => readFileSync(
  resolve(baseDir, relativePath),
  "utf8",
);

const dialogSource = readSource("FinanceiroCicloManualDialog.tsx");
const listSource = readSource("FinanceiroAlunosList.tsx");
const statusSource = readSource("FinanceiroCicloManualStatus.tsx");
const accessibleDialogSource = readSource("hooks/useAccessibleDialog.ts");
const parserSource = readSource("matricula-tecnica-ciclo-manual.parser.ts");

test("critério de elegibilidade nunca é exibido como código técnico cru", () => {
  assert.doesNotMatch(
    dialogSource,
    /\{row\.cicloManual\.criterioElegibilidade\}/,
    "o valor recebido do backend não pode ser interpolado diretamente na interface",
  );
  assert.doesNotMatch(dialogSource, /PENULTIMA_SEM_ATRASO/);
  assert.match(dialogSource, /getCriterioElegibilidadeLabel/);
  assert.match(
    dialogSource,
    /getCriterioElegibilidadeLabel\(\s*row\.cicloManual\.criterioElegibilidade,?\s*\)/,
  );
  assert.match(parserSource, /PENULTIMA_SEM_ATRASO/);
  assert.match(parserSource, /Penúltima[^\n'"`]*(?:paga|quitada)/i);
  assert.doesNotMatch(
    `${listSource}\n${statusSource}`,
    />[^<]*PENULTIMA_SEM_ATRASO[^<]*</,
  );
});

test("modal é portado para o body e ocupa o viewport sem folga superior no mobile", () => {
  assert.match(dialogSource, /import\s*\{[^}]*createPortal[^}]*\}\s*from\s*['"]react-dom['"]/);
  assert.match(dialogSource, /createPortal\s*\(/);
  assert.match(dialogSource, /document\.body/);

  const overlayClass = dialogSource.match(
    /className=["`]([^"`]*fixed[^"`]*inset-0[^"`]*)["`]/,
  )?.[1] || "";
  assert.match(overlayClass, /h-\[100dvh\]/);
  assert.match(overlayClass, /w-screen/);
  assert.match(overlayClass, /overflow-hidden/);
  const mobileClasses = overlayClass.split(/\s+/);
  assert.ok(!mobileClasses.includes("p-4"));
  assert.ok(!mobileClasses.includes("items-center"));
  assert.match(
    dialogSource,
    /<main[^>]*className="[^"]*min-h-0[^"]*overflow-y-auto[^"]*"[^>]*data-testid="manual-cycle-scroll-area"/,
  );
});

test("wizard apresenta exatamente Dados, Composição e Revisão nessa ordem", () => {
  const dataPosition = dialogSource.indexOf("Dados");
  const compositionPosition = dialogSource.indexOf("Composição");
  const reviewPosition = dialogSource.indexOf("Revisão");

  assert.ok(dataPosition >= 0, "etapa Dados ausente");
  assert.ok(compositionPosition > dataPosition, "etapa Composição ausente ou fora de ordem");
  assert.ok(reviewPosition > compositionPosition, "etapa Revisão ausente ou fora de ordem");
  assert.match(dialogSource, /(?:number|numero|step|etapa)\s*:\s*1[^\n]*Dados/i);
  assert.match(dialogSource, /(?:number|numero|step|etapa)\s*:\s*2[^\n]*Composição/i);
  assert.match(dialogSource, /(?:number|numero|step|etapa)\s*:\s*3[^\n]*Revisão/i);
  const stepsBlock = dialogSource.match(
    /const WIZARD_STEPS[^=]*=\s*\[([\s\S]*?)\];/,
  )?.[1] || "";
  assert.equal([...stepsBlock.matchAll(/number\s*:/g)].length, 3);
  assert.match(dialogSource, /useState(?:<WizardStep>)?\(1\)/);
});

test("composição lista rematrícula, parcelas, valores, vencimentos e termos", () => {
  assert.match(dialogSource, /preview\.itens\.map/);
  assert.match(dialogSource, /REMATRICULA/);
  assert.match(dialogSource, /PARCELA/);
  assert.match(dialogSource, /item\.descricao/);
  assert.match(dialogSource, /item\.valor/);
  assert.match(dialogSource, /item\.vencimento/);

  for (const field of [
    "descontoPontualidade",
    "jurosAtrasoPercentual",
    "multaAtrasoPercentual",
    "instrucaoBoleto",
  ]) {
    assert.match(dialogSource, new RegExp(`preview\\.termos\\.${field}`));
  }
  assert.match(dialogSource, /termos\.aplicacao\.rematricula/);
  assert.match(dialogSource, /termos\.aplicacao\.mensalidade/);
  assert.match(dialogSource, /Desconto/i);
  assert.match(dialogSource, /Multa/i);
  assert.match(dialogSource, /Juros/i);
});

test("revisão usa um único CTA de geração e emissão bancária", () => {
  assert.match(dialogSource, /Gerar e emitir BolePix/);
  assert.match(dialogSource, /Geração e emissão em uma única ação/);
  assert.doesNotMatch(dialogSource, /Criar(?:\s+\$\{[^}]*\})?\s+recebíveis locais/i);
  assert.doesNotMatch(dialogSource, /Emissão bancária continua separada|Nenhum boleto Banese/i);
});

test("foco, Escape, rolagem e restauração permanecem protegidos", () => {
  assert.match(dialogSource, /useAccessibleDialog\(true, onClose, pending\)/);
  assert.match(dialogSource, /role="dialog"/);
  assert.match(dialogSource, /aria-modal="true"/);
  assert.match(dialogSource, /aria-labelledby="manual-cycle-title"/);
  assert.match(dialogSource, /ref=\{dialogRef\}/);
  assert.match(dialogSource, /initialFocusRef\.current = node/);

  assert.match(accessibleDialogSource, /event\.key === 'Escape'/);
  assert.match(accessibleDialogSource, /!closeBlockedRef\.current/);
  assert.match(accessibleDialogSource, /event\.key !== 'Tab'/);
  assert.match(accessibleDialogSource, /querySelectorAll\(FOCUSABLE_SELECTOR\)/);
  assert.match(accessibleDialogSource, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(accessibleDialogSource, /document\.body\.style\.overflow = previousOverflow/);
  assert.match(accessibleDialogSource, /previouslyFocused\?\.focus\(\)/);
});
