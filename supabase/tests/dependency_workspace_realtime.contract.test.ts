import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test(name: string, testFunction: () => void | Promise<void>): void;
};

const pageUrl = new URL(
  "../../modules/gestor/secretaria/dependencias-academicas/DependenciasAcademicasPage.tsx",
  import.meta.url,
);
const realtimeUrl = new URL(
  "../../modules/gestor/secretaria/dependencias-academicas/hooks/useDependenciasAcademicasRealtime.ts",
  import.meta.url,
);
const realtimePolicyUrl = new URL(
  "../migrations/20260731034633_allow_dependency_workspace_realtime_events.sql",
  import.meta.url,
);
const financeRealtimePolicyUrl = new URL(
  "../migrations/20260731034722_allow_dependency_workspace_finance_realtime_events.sql",
  import.meta.url,
);

Deno.test("workspace não duplica o cabeçalho nem depende de atualização manual", async () => {
  const page = await Deno.readTextFile(pageUrl);

  assert.doesNotMatch(page, /Atualizar workspace/i);
  assert.doesNotMatch(page, /RefreshCw/);
  assert.doesNotMatch(page, /Gestão por disciplina/i);
});

Deno.test("fechamento acadêmico e financeiro invalidam o workspace em tempo real", async () => {
  const realtime = await Deno.readTextFile(realtimeUrl);

  assert.match(realtime, /table:\s*'gestao_realtime_events'/);
  assert.match(realtime, /filter:\s*`polo_id=eq\.\$\{poloId\}`/);
  assert.match(realtime, /DEPENDENCY_ACADEMIC_SOURCES/);
  assert.match(realtime, /'turmas_disciplinas'/);
  assert.match(realtime, /'diario_frequencia'/);
  assert.match(realtime, /'diario_notas'/);
  assert.match(realtime, /dependenciasAcademicasKeys\.ofertasRoot\(poloId\)/);
  assert.match(realtime, /table:\s*'finance_realtime_events'/);
  assert.match(
    realtime,
    /dependenciasAcademicasKeys\.workspace\(poloId\)[\s\S]*refetchType:\s*'active'/,
  );
  assert.match(realtime, /subscribedOnce/);
});

Deno.test("perfil granular de dependências pode ler eventos acadêmicos do polo", async () => {
  const policy = await Deno.readTextFile(realtimePolicyUrl);

  assert.match(policy, /gestao_realtime_events_select/i);
  assert.match(
    policy,
    /gestor_has_tab\([\s\S]*'secretaria'[\s\S]*'dependencias-academicas'/i,
  );
  assert.match(policy, /is_gestor_for_polo\(polo_id\)/i);
  assert.doesNotMatch(policy, /for\s+(insert|update|delete)/i);
});

Deno.test("perfil granular recebe mudanças financeiras sem ler contas diretamente", async () => {
  const policy = await Deno.readTextFile(financeRealtimePolicyUrl);
  const realtime = await Deno.readTextFile(realtimeUrl);

  assert.match(policy, /finance_realtime_events_select/i);
  assert.match(
    policy,
    /gestor_has_tab\([\s\S]*'secretaria'[\s\S]*'dependencias-academicas'/i,
  );
  assert.match(policy, /current_aluno_id\(\)/i);
  assert.doesNotMatch(realtime, /table:\s*'contas_receber'/);
});
