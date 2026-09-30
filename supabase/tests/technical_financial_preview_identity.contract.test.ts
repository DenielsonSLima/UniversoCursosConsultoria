import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();
const migration = readFileSync(
  resolve(
    root,
    "supabase/migrations/20260930190000_fix_technical_financial_rule_preview_identity.sql",
  ),
  "utf8",
);
const hook = readFileSync(
  resolve(
    root,
    "modules/gestor/gestao/tecnicos/detalhes/components/financeiro/hooks/useMatriculaTecnicaFinanceiro.ts",
  ),
  "utf8",
);
const config = readFileSync(
  resolve(
    root,
    "modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroConfig.tsx",
  ),
  "utf8",
);

test("prévia projeta a mesma identidade no topo e no bloco canônico", () => {
  assert.match(migration, /c754225812d2d924beecef825961b710/);
  assert.match(migration, /pg_catalog\.pg_get_functiondef/);
  assert.match(migration, /v_security_definer is distinct from true/);
  assert.match(migration, /v_volatility is distinct from 's'/);
  assert.match(
    migration,
    /v_config is distinct from array\['search_path=""'\]/,
  );
  assert.match(migration, /authenticated:EXECUTE:false/);
  assert.match(migration, /service_role:EXECUTE:false/);
  assert.ok(
    migration.indexOf("c754225812d2d924beecef825961b710") <
      migration.indexOf(
        "create or replace function public.prever_regra_financeira_turma_tecnica_secure",
      ),
    "A guarda de drift deve preceder o CREATE OR REPLACE",
  );
  assert.match(
    migration,
    /'turmaRevisao',\s*v_turma\.regra_financeira_revisao/i,
  );
  assert.match(migration, /'turmaFingerprint',\s*v_fingerprint/i);
  assert.match(
    migration,
    /return v_rendered \|\| jsonb_build_object\([\s\S]*?'revisao',\s*v_turma\.regra_financeira_revisao,[\s\S]*?'fingerprint',\s*v_fingerprint/i,
  );
  assert.match(
    migration,
    /internal_academic\.validate_technical_financial_rule_input/i,
  );
  assert.match(
    migration,
    /internal_academic\.technical_financial_rule_fingerprint_v3/i,
  );
  assert.match(
    migration,
    /internal_academic\.render_technical_financial_rule/i,
  );
  assert.match(migration, /security definer[\s\S]*?set search_path = ''/i);
  assert.match(
    migration,
    /revoke all on function public\.prever_regra_financeira_turma_tecnica_secure\([\s\S]*?from public, anon/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.prever_regra_financeira_turma_tecnica_secure\([\s\S]*?to authenticated, service_role/i,
  );
});

test("cliente falha fechado sem loop e oferece repetição explícita", () => {
  const previewHook = hook.slice(
    hook.indexOf("export const usePreverRegraFinanceiraTecnica"),
    hook.indexOf("const reconcileWorkspace"),
  );
  assert.match(previewHook, /!isFinanceiroContractError\(error\)/);
  assert.match(previewHook, /failureCount < 1/);
  assert.match(config, /previewQuery\.isError/);
  assert.match(config, /Não foi possível calcular a prévia/);
  assert.match(config, /isFinanceiroContractError\(previewQuery\.error\)/);
  assert.doesNotMatch(config, /previewQuery\.error\.message/);
  assert.doesNotMatch(config, /\berror\.message\b/);
  assert.match(
    config,
    /O servidor não confirmou a alteração\. Tente novamente\./,
  );
  assert.match(config, /previewQuery\.refetch\(\)/);
});
