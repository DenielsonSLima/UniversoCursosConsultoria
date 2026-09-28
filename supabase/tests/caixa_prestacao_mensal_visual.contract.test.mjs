import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL(
  '../migrations/20260927234500_create_caixa_prestacao_mensal_visual_secure.sql',
  import.meta.url,
), 'utf8');
const start = migration.indexOf(
  'CREATE OR REPLACE FUNCTION public.get_caixa_prestacao_mensal_visual_secure(',
);
const end = migration.indexOf('$function$;', start);
const body = migration.slice(start, end);

test('RPC visual preserva a guarda canônica e ACL mínima', () => {
  assert.ok(start >= 0 && end > start);
  assert.match(body, /p_polo_id uuid DEFAULT NULL,[\s\S]*p_competencia date DEFAULT pg_catalog\.timezone\(/);
  assert.match(body, /RETURNS jsonb[\s\S]*STABLE[\s\S]*SECURITY DEFINER[\s\S]*SET search_path TO ''/);
  assert.match(body, /v_payload := public\.get_caixa_prestacao_mensal_secure\([\s\S]*p_polo_id,[\s\S]*p_competencia,[\s\S]*6[\s\S]*\);/);
  assert.doesNotMatch(body, /FROM public\.(?:contas_|despesas_|emprestimos_|polos)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_caixa_prestacao_mensal_visual_secure\([\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_caixa_prestacao_mensal_visual_secure\([\s\S]*TO authenticated, service_role/);
  assert.doesNotMatch(migration, /GRANT EXECUTE[\s\S]*TO anon/);
});

test('movimentação entrega seis meses e toda a geometria no banco', () => {
  for (const key of [
    'visualizacoes', 'versao', 'janela_meses', 'movimentacao', 'view_box',
    'dominio_minimo', 'dominio_maximo', 'base_y', 'meses',
    'resultado_pontos', 'inadimplencia_pontos', 'x', 'entradas_valor',
    'saidas_valor', 'resultado_valor', 'inadimplencia_valor',
    'entradas_altura', 'saidas_altura', 'resultado_y', 'inadimplencia_y',
    'entrada_x', 'saida_x', 'entrada_y', 'saida_y', 'largura',
  ]) {
    assert.ok(body.includes(`'${key}'`), `Campo chart-ready ausente: ${key}`);
  }
  assert.match(body, /count\(\*\) OVER \(\)::numeric AS quantidade/);
  assert.match(body, /\(pontos\.ordinal::numeric - 0\.5\) \/ pontos\.quantidade \* 100/);
  assert.match(body, /maximo - minimo AS amplitude/);
  assert.match(body, /string_agg\([\s\S]*resultado_y[\s\S]*ORDER BY geometria\.ordinal/);
  assert.match(body, /string_agg\([\s\S]*inadimplencia_y[\s\S]*ORDER BY geometria\.ordinal/);
});

test('composições e saldos usam segmentos cumulativos sem cálculo cliente', () => {
  for (const key of [
    'composicao', 'receitas', 'despesas', 'total', 'itens', 'percentual',
    'inicio_percentual', 'comprimento_percentual', 'saldos_por_conta',
    'offset_percentual', 'gap_percentual', 'total_positivo',
  ]) {
    assert.ok(body.includes(`'${key}'`), `Campo de composição ausente: ${key}`);
  }
  assert.match(body, /ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING/);
  assert.match(body, /ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW/);
  assert.match(body, /'comprimento_percentual', fim - inicio/);
  assert.match(body, /'offset_percentual', -inicio/);
  assert.match(body, /'gap_percentual', 100 - \(fim - inicio\)/);
  assert.match(body, /coalesce\(\(item ->> 'valor_exibido'\)::numeric, 0\) > 0/);
  assert.ok((body.match(/::numeric\(30, 2\)::text/g) || []).length >= 9);
});

test('retorno mantém o payload mensal integral e apenas acrescenta visualizações', () => {
  assert.match(body, /RETURN v_payload \|\| pg_catalog\.jsonb_build_object\(/);
  assert.match(body, /'janela_meses', 6/);
  assert.ok(body.indexOf('v_payload := public.get_caixa_prestacao_mensal_secure(')
    < body.indexOf("RETURN v_payload || pg_catalog.jsonb_build_object("));
});
