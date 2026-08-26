import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildEadCheckoutSubmission,
  resolveEadCheckoutOptions,
} from "./eadCheckoutOptions";

test("EAD oferece Boleto com Pix e Pix sobre o mesmo BolePix", () => {
  const options = resolveEadCheckoutOptions({
    valor: 99.9,
    financeiro_config: {
      metodosRecebimento: {
        boleto: true,
        pix: true,
        cartao: true,
      },
      cartao: {
        aceitar: true,
        maxParcelas: 12,
      },
    },
  });

  assert.deepEqual(options.options, [
    { method: "BOLETO", label: "Boleto com Pix" },
    { method: "PIX", label: "Pix" },
  ]);
  assert.equal(options.allowInstallments, false);
  assert.equal(options.maxParcelas, 1);
});

test("apresentação Pix envia BOLETO ao backend e mantém a intenção visual", () => {
  assert.deepEqual(buildEadCheckoutSubmission("PIX"), {
    method: "BOLETO",
    installments: 1,
    presentation: "PIX",
  });
});

test("apresentação do boleto abre o mesmo BolePix como documento", () => {
  assert.deepEqual(buildEadCheckoutSubmission("BOLETO"), {
    method: "BOLETO",
    installments: 1,
    presentation: "BOLETO",
  });
});

test("sem rota de boleto nenhuma apresentação BolePix é oferecida", () => {
  const options = resolveEadCheckoutOptions({
    valor: 99.9,
    financeiro_config: {
      metodosRecebimento: {
        boleto: false,
        pix: true,
        cartao: true,
      },
      cartao: {
        aceitar: true,
      },
    },
  });

  assert.deepEqual(options.options, []);
});

test("curso EAD rebaixa Pix sem payload para boleto oficial", () => {
  const hookSource = readFileSync(
    "modules/aluno/cursos/hooks/useCourseCheckout.ts",
    "utf8",
  );

  assert.match(hookSource, /returnedPresentation:\s*result\.presentation/);
  assert.match(hookSource, /const bolePixFallback = requestedPresentation === 'PIX'/);
  assert.match(hookSource, /!hasPixQrCode/);
  assert.match(hookSource, /presentation:\s*'BOLETO'/);
  assert.match(hookSource, /PIX_UNAVAILABLE_USE_BOLETO/);
  assert(
    hookSource.indexOf("if (alreadyPaid)") <
      hookSource.indexOf("if (wantsInlineBolePix)"),
  );
});
