import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = (name: string) => readFile(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8');
const termsName = '20261013121200_revise_technical_contract_individual_terms';

async function revisedBody() {
  const [original, terms] = await Promise.all([
    migration('20260809210000_create_full_technical_contract_draft'),
    migration(termsName),
  ]);
  const match = original.match(/'corpo', \$minuta\$\n([\s\S]*?)\n\$minuta\$,/u);
  assert.ok(match);
  let body = match[1];
  const changes = [...terms.matchAll(/\$old\$([\s\S]*?)\$old\$,\s*\$new\$([\s\S]*?)\$new\$/gu)];
  assert.equal(changes.length, 23);
  for (const [, before, after] of changes) {
    assert.equal(body.split(before).length - 1, 1, `âncora única: ${before.slice(0, 70)}`);
    body = body.replaceAll(before, after);
  }
  return { original: match[1], body, terms };
}

test('revisão mantém 24 cláusulas e proteções, com plano individual completo', async () => {
  const { original, body } = await revisedBody();
  assert.deepEqual([...body.matchAll(/CLÁUSULA\s+(\d+)ª/gu)].map((item) => item[1]),
    [...original.matchAll(/CLÁUSULA\s+(\d+)ª/gu)].map((item) => item[1]));
  assert.doesNotMatch(body, /canônic|esta minuta|condicionado à validação jurídica|modalidade \{\{curso\.modalidade\}\}/iu);
  for (const preserved of [
    'este contrato não autoriza cobrança automática integral fora desses limites',
    'mediante demonstração das despesas e das condições expressamente aprovadas',
    'sem afastar o foro legalmente competente e os direitos do consumidor',
    'será livre, destacada, revogável nos limites legais',
    'sem transferência automática de obrigações institucionais',
  ]) assert.ok(body.includes(preserved), preserved);
  for (const token of ['contratante.nome', 'contratante.cpf', 'financeiro.quantidadeCiclos',
    'financeiro.quantidadeParcelas', 'financeiro.planoPagamento', 'financeiro.valorTotalContrato',
    'financeiro.quantidadeRematriculas', 'financeiro.valorTotalRematriculas']) {
    assert.ok(body.includes(`{{${token}}}`), token);
  }
  assert.doesNotMatch(body, /R\$\s*[\d.,]+|\b24 parcelas\b|\b12 parcelas\b/u);
  assert.equal((body.match(/\{\{financeiro\.condicoes\}\}/gu) || []).length, 1);
  assert.match(body, /O ALUNO deverá cumprir/u);
  assert.match(body, /ALUNO aos atos escolares não exime o CONTRATANTE do pagamento/u);
});

test('modelo é revisado sob lock sem aprovar ou reescrever documentos emitidos', async () => {
  const { terms } = await revisedBody();
  assert.match(terms, /for update;/u);
  assert.match(terms, /revisao = v_current\.revisao \+ 1/u);
  assert.match(terms, /status = 'EM_REVISAO'/u);
  assert.match(terms, /CONTRATO_A4_INSTITUCIONAL_V4_LEGIVEL/u);
  assert.match(terms, /insert into public\.documentos_modelos_historico/u);
  assert.match(terms, /v_content jsonb := p_content/u);
  assert.match(terms, /O modelo técnico diverge do texto revisado/u);
  assert.doesNotMatch(terms, /(?:insert into|update|delete from)\s+public\.(?:documentos_modelos_aprovacoes|documentos_validacao|assinatura_eletronica_envelopes)/iu);
  assert.doesNotMatch(terms, /jsonb_set\(v_content, '\{(?:marcaDagua|qr|layoutEncerramento|regrasDinamicas|sourceDocument)\}'/u);
});

test('novos tokens são resolvidos no backend e contratante usa data da emissão', async () => {
  const [party, render, snapshot] = await Promise.all([
    migration('20261013121000_contract_party_snapshot'),
    migration('20261013121100_contract_individual_terms_render'),
    migration('20261009163100_contract_student_identity_snapshot'),
  ]);
  assert.match(party, /contract_party_snapshot\(\s*v_snapshot, \(v_issued\.emitido_em at time zone 'America\/Maceio'\)::date/u);
  assert.match(party, /p_reference_date - interval '18 years'/u);
  assert.match(party, /position\('\{\{contratante\.'/u);
  assert.doesNotMatch(party, /update public\.(?:parceiros|matriculas|documentos_validacao)/iu);
  assert.match(snapshot, /v_snapshot := public\.enriquecer_snapshot_identidade_visual_contrato\(v_snapshot\);/u);
  for (const section of ['body', 'header', 'footer']) {
    assert.ok(render.includes(`v_${section} := internal_academic.contract_individual_terms_text(v_${section}, p_snapshot)`));
  }
  assert.match(render, /condicoesExibicao/u);
  assert.match(render, /Dado obrigatório do contrato indisponível/u);
  assert.doesNotMatch(render, /from public\.(?:parceiros|matriculas|contas_receber)/iu);
});
