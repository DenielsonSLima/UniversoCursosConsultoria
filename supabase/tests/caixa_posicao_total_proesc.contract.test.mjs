import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildCaixaProescReadOnlyProbe } from './caixa_posicao_total_proesc.readonly.mjs';

const sql = readFileSync(new URL(
  '../migrations/20260913123752_caixa_posicao_total_proesc_control.sql', import.meta.url), 'utf8');
const control = sql.slice(sql.indexOf('select coalesce(array_agg(conta.id)'),
  sql.indexOf('-- O vínculo técnico'));
const missingFacts = sql.slice(sql.indexOf('-- Movimento técnico pago'),
  sql.indexOf('  if v_contas_sem_historico > 0 then'));

test('exceção movimentos-only exige identidade técnica, base nula e saldo zero', () => {
  for (const fragment of [
    'public.can_access_conta_bancaria(conta.id)',
    'conta.system_managed is true',
    "conta.codigo_interno = 'INTEGRATION:PROESC:' || conta.polo_id::text",
    'conta.saldo_inicial = 0',
    'conta.data_saldo is null',
    'p_polo_id is null or conta.polo_id = p_polo_id or exists',
    'acesso.polo_id = p_polo_id',
  ]) assert.ok(control.includes(fragment), fragment);
  assert.match(sql, /where not conta.id = any\(v_contas_controle_ids\)\s+and \(conta.data_saldo is null or conta.data_saldo > v_data_corte\)/);
  assert.match(sql, /from contas_escopo conta\s+where not conta.controle_historico\s+union all/);
  assert.doesNotMatch(sql, /coalesce\(conta.data_saldo/);
});

test('pago indatável ou sem valor recebido continua impedindo fechamento', () => {
  for (const alias of ['recebimento', 'pagamento', 'despesa']) {
    assert.ok(missingFacts.includes(`${alias}.data_pagamento is null`));
    assert.ok(missingFacts.includes(`${alias}.data_pagamento <= v_data_corte`));
    assert.ok(missingFacts.includes(`${alias}.valor_pago`));
    assert.ok(sql.includes(`conta.controle_historico and ${alias}.data_pagamento <= v_data_corte`));
  }
  assert.ok(missingFacts.includes('recebimento.manual_settlement_reversed_at is null'));
  assert.ok(missingFacts.includes('recebimento.manual_settlement_received_cents::numeric / 100.0'));
  assert.ok(missingFacts.includes('pagamento.despesa_lancamento_id is null'));
});

test('histórico importado preserva escopo, datas econômicas e conta única', () => {
  assert.match(sql, /acesso.polo_id = p_polo_id\s+and \(conta.id = any\(v_contas_controle_ids\)\s+or acesso.created_at::date <= v_data_corte\)/);
  assert.ok(sql.includes('p_polo_id is null or movimento.polo_movimento_id = p_polo_id'));
  assert.equal((sql.match(/from public.contas_receber recebimento/g) ?? []).length, 2,
    'One validation and one movement source; do not append duplicated Proesc receipts');
  assert.ok(sql.includes("p_polo_id is not null or transferencia.tipo = 'FISICA'"));
  assert.ok(sql.includes('não representam saldo bancário disponível'));
});

test('autorização original antecede fatos e grants continuam mínimos', () => {
  assert.ok(sql.indexOf('perform public.get_caixa_financiamento_resumo_secure')
    < sql.indexOf('into v_contas_controle_ids'));
  assert.ok(sql.indexOf('perform public.get_caixa_patrimonio_resumo_secure')
    < sql.indexOf('into v_contas_controle_ids'));
  assert.match(sql, /security definer\s+set search_path = ''/);
  assert.match(sql, /revoke all on function public.get_caixa_posicao_total_resumo_secure\(uuid, date\)\s+from public, anon/);
});

test('ensaio usa o corpo candidato sob leitura, sem DDL ou alteração de fatos', () => {
  const probe = buildCaixaProescReadOnlyProbe();
  assert.match(probe, /^begin;\nset transaction read only;/);
  assert.match(probe, /\nrollback;/);
  assert.doesNotMatch(probe, /\b(?:create|alter|drop|insert into|update public|delete from)\s+(?:function|table|schema|public\.)/i);
  assert.doesNotMatch(probe, /return jsonb_build_object/);
  assert.ok(probe.includes('public.get_contas_bancarias_posicoes_polos_secure()'));
  assert.ok(probe.includes('v_control_observed = v_control_expected'));
  assert.ok(probe.includes("v_result->>'motivo'='ACESSO_RESTRITO'"));
});
