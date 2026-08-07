import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test(name: string, testFunction: () => void | Promise<void>): void;
};

const serviceUrl = new URL(
  "../../modules/gestor/secretaria/dependencias-academicas/dependencias-academicas.service.ts",
  import.meta.url,
);
const rulesUrl = new URL(
  "../../modules/gestor/secretaria/dependencias-academicas/components/DependenciasFinancialRules.tsx",
  import.meta.url,
);

Deno.test("pré-financeiro usa catálogo do polo, não somente alunos reprovados", async () => {
  const [service, rules] = await Promise.all([
    Deno.readTextFile(serviceUrl),
    Deno.readTextFile(rulesUrl),
  ]);

  assert.match(service, /'disciplinas_configuraveis'/i);
  assert.match(service, /disciplinasConfiguraveis:/i);
  assert.match(rules, /disciplines: DependenciaDisciplinaConfiguravel\[\]/i);
  assert.doesNotMatch(rules, /items: DependenciaAcademica\[\]/i);
});

Deno.test("retry da regra financeira conserva a chave até sucesso ou mudança", async () => {
  const rules = await Deno.readTextFile(rulesUrl);

  assert.match(rules, /resolveDependencyPolicyAttempt\(/i);
  assert.match(rules, /policyAttemptRef\.current = attempt/i);
  assert.match(
    rules,
    /onSuccess:[\s\S]*policyAttemptRef\.current = null/i,
  );
});
