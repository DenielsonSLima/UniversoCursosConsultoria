import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  "../migrations/20260810214442_extend_caixa_pdf_with_financing_and_assets.sql",
  import.meta.url,
);
const sql = await Deno.readTextFile(migrationUrl);

const detailedReportDefinition = sql.match(
  /create function public\.get_caixa_relatorio_mensal_detalhado_secure\([\s\S]*?\$function\$;/i,
)?.[0] ?? "";

Deno.test("relatório detalhado do Caixa v4 compõe patrimônio e financiamento pelas RPCs canônicas", () => {
  assert.match(
    sql,
    /alter function public\.get_caixa_relatorio_mensal_detalhado_secure\(uuid, date\)[\s\S]*rename to get_caixa_relatorio_mensal_detalhado_v3_core/i,
  );
  assert.match(
    detailedReportDefinition,
    /v_relatorio := public\.get_caixa_relatorio_mensal_detalhado_v3_core\([\s\S]*p_polo_id,[\s\S]*p_competencia/i,
  );
  assert.match(
    detailedReportDefinition,
    /'disponivel', true,[\s\S]*'dados', public\.get_caixa_financiamento_resumo_secure\([\s\S]*p_polo_id,[\s\S]*p_competencia/i,
  );
  assert.match(
    detailedReportDefinition,
    /'disponivel', true,[\s\S]*'dados', public\.get_caixa_patrimonio_resumo_secure\([\s\S]*p_polo_id,[\s\S]*p_competencia/i,
  );
  assert.match(
    detailedReportDefinition,
    /'versao', 4,[\s\S]*'financiamento', v_financiamento,[\s\S]*'patrimonio', v_patrimonio/i,
  );
});

Deno.test("v4 conserva autorização, menor privilégio e resultado operacional isolado", () => {
  assert.match(
    sql,
    /alter function public\.get_caixa_financiamento_resumo_secure\(uuid, date\)[\s\S]*set search_path = ''/i,
  );
  assert.match(
    detailedReportDefinition,
    /security definer[\s\S]*set search_path = ''/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.get_caixa_relatorio_mensal_detalhado_v3_core\(uuid, date\)[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.get_caixa_relatorio_mensal_detalhado_secure\(uuid, date\)[\s\S]*from public, anon/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.get_caixa_relatorio_mensal_detalhado_secure\(uuid, date\)[\s\S]*to authenticated, service_role/i,
  );
  assert.doesNotMatch(detailedReportDefinition, /from public\.(?:patrimonios|emprestimos_financeiros|emprestimo_parcelas)/i);
  assert.doesNotMatch(detailedReportDefinition, /resumo_competencia/i);
  assert.match(
    sql,
    /sem compor financiamento ou patrimônio no resultado operacional/i,
  );
  const restrictedBlocks = detailedReportDefinition.match(
    /exception when insufficient_privilege then[\s\S]*?'disponivel', false,[\s\S]*?'motivo', 'ACESSO_RESTRITO'/gi,
  ) ?? [];
  assert.equal(restrictedBlocks.length, 2);
});
