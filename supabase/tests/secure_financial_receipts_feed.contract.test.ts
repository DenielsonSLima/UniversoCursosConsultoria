import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../migrations/20260830215000_create_secure_financial_receipts_feed.sql',
    import.meta.url,
  ),
  'utf8',
);

const rpcName = 'list_financial_receipts_secure';
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const extractRpc = (source: string, name: string) => {
  const start = source.search(
    new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\(`, 'i'),
  );
  assert.notEqual(start, -1, `RPC public.${name} deve existir.`);

  const tail = source.slice(start);
  const closingDelimiter = tail.match(/\$(?:function)?\$\s*;/i);
  assert.ok(closingDelimiter, `RPC public.${name} deve possuir corpo delimitado.`);

  return tail.slice(0, closingDelimiter.index! + closingDelimiter[0].length);
};

const rpc = extractRpc(migration, rpcName);
const rpcDeclaration = rpc.match(
  new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${rpcName}\\s*\\(([\\s\\S]*?)\\)\\s*returns\\s+jsonb`,
    'i',
  ),
);
assert.ok(rpcDeclaration, `Assinatura de public.${rpcName} deve existir.`);
const rpcArgumentTypes = Array.from(
  rpcDeclaration[1].matchAll(/\bp_[a-z0-9_]+\s+(uuid|date|text|integer)\b/gi),
  (match) => match[1].toLowerCase(),
);

test('RPC expõe somente o feed paginado e os filtros financeiros combinados', () => {
  for (const parameter of [
    /p_company_id\s+uuid\s+default\s+null/i,
    /p_polo_id\s+uuid\s+default\s+null/i,
    /p_environment\s+text\s+default\s+'production'/i,
    /p_payment_start\s+date\s+default\s+null/i,
    /p_payment_end\s+date\s+default\s+null/i,
    /p_search\s+text\s+default\s+null/i,
    /p_origin\s+text\s+default\s+'TODOS'/i,
    /p_page\s+integer\s+default\s+1/i,
    /p_page_size\s+integer\s+default\s+20/i,
  ]) {
    assert.match(rpcDeclaration[1], parameter);
  }
  assert.equal(rpcArgumentTypes.length, 9, 'A ACL deve mirar o overload com environment.');
  assert.match(rpc, /returns\s+jsonb/i);

  for (const key of [
    'items',
    'total_count',
    'page',
    'page_size',
    'total_pages',
    'counts',
  ]) {
    assert.match(rpc, new RegExp(`'${key}'`, 'i'), `Envelope ausente: ${key}`);
  }
});

test('SECURITY DEFINER fixa search_path vazio e usa ACL mínima', () => {
  assert.match(rpc, /security\s+definer/i);
  assert.match(rpc, /set\s+search_path\s*=\s*''/i);

  const escapedName = escapeRegExp(rpcName);
  const escapedSignature = rpcArgumentTypes.map(escapeRegExp).join('\\s*,\\s*');
  const revoke = migration.match(
    new RegExp(
      `revoke\\s+all\\s+on\\s+function\\s+public\\.${escapedName}\\s*\\(\\s*${escapedSignature}\\s*\\)\\s+from\\s+([^;]+);`,
      'i',
    ),
  );
  assert.ok(revoke, 'ACL da RPC deve ser reinicializada explicitamente.');

  const revokedRoles = revoke[1].toLowerCase();
  for (const role of ['public', 'anon', 'service_role']) {
    assert.match(revokedRoles, new RegExp(`\\b${role}\\b`), `EXECUTE não revogado de ${role}.`);
  }

  assert.match(
    migration,
    new RegExp(
      `grant\\s+execute\\s+on\\s+function\\s+public\\.${escapedName}\\s*\\(\\s*${escapedSignature}\\s*\\)\\s+to\\s+authenticated\\s*;`,
      'i',
    ),
  );
  assert.doesNotMatch(
    migration,
    new RegExp(
      `grant\\s+execute\\s+on\\s+function\\s+public\\.${escapedName}\\s*\\([^;]+\\)\\s+to\\s+(?:public|anon|service_role)\\b`,
      'i',
    ),
  );
});

test('autorização combina identidade, permissão de recebíveis e polos permitidos', () => {
  assert.match(rpc, /auth\.uid\(\)\s+is\s+null/i);
  assert.match(rpc, /public\.gestor_has_financeiro_tab\('receber'\)/i);
  assert.match(rpc, /public\.gestor_allowed_polo_ids\(\)/i);
  assert.match(rpc, /p_polo_id\s*=\s*any\s*\([^)]*allowed_polo_ids/i);

  assert.match(
    rpc,
    /[a-z_][a-z0-9_]*\.polo_id\s*=\s*any\s*\([^)]*allowed_polo_ids/i,
  );
  assert.match(
    rpc,
    /p_company_id\s+is\s+null[\s\S]*?(?:empresa_id|company_id)\s*=\s*p_company_id/i,
  );
  assert.match(
    rpc,
    /p_polo_id\s+is\s+null[\s\S]*?polo_id\s*=\s*p_polo_id/i,
  );
});

test('CPF/CNPJ expõe somente os dois últimos dígitos e busca exige documento completo', () => {
  const documentMask = rpc.match(
    /case\s+when\s+length\(regexp_replace\([\s\S]*?end\s+as\s+cliente_cpf_cnpj/i,
  );
  assert.ok(documentMask, 'Máscara SQL de CPF/CNPJ ausente.');
  assert.match(documentMask[0], /right\s*\([\s\S]*?,\s*2\s*\)/i);
  assert.match(documentMask[0], /'\*\*\*\.\*\*\*\.\*\*\*-'/i);
  assert.match(documentMask[0], /'\*\*\.\*\*\*\.\*\*\*\/\*\*\*\*-'/i);
  assert.doesNotMatch(documentMask[0], /\b(?:substr|substring|left)\s*\(/i);
  assert.doesNotMatch(
    rpc,
    /['"]cliente_cpf_cnpj['"]\s*,\s*[a-z_][a-z0-9_]*\.(?:cpf|cpf_cnpj)\b/i,
  );
  assert.doesNotMatch(rpc, /['"](?:cpf|cpf_cnpj)['"]\s*,/i);

  assert.match(rpc, /length\s*\(v_search_digits\)\s+in\s*\(\s*11\s*,\s*14\s*\)/i);
  assert.match(
    rpc,
    /v_search_digits\s*=\s*regexp_replace\s*\(coalesce\([^)]*(?:search_document|cpf_cnpj)/i,
  );
  assert.doesNotMatch(rpc, /(?:search_document|cpf_cnpj)[\s\S]{0,160}like\s+'%'\s*\|\|\s*v_search_digits/i);
});

test('histórico não executa resolver nem recebe composição financeira inferida', () => {
  assert.match(
    rpc,
    /left\s+join\s+lateral\s+public\.resolve_receivable_financial_composition\([\s\S]*?\)\s+composition\s+on\s+receipt\.origem\s*<>\s*'HISTORICO_MIGRADO'/i,
  );
  assert.doesNotMatch(
    rpc,
    /cross\s+join\s+lateral\s+public\.resolve_receivable_financial_composition/i,
  );
  assert.match(rpc, /'HISTORICO_SEM_COMPOSICAO'/i);
  assert.match(rpc, /'HISTORICO_SEM_DETALHAMENTO'/i);
  assert.doesNotMatch(
    rpc,
    /coalesce\s*\(\s*composition\.(?:juros|multa|acrescimo|desconto)\s*,\s*0/i,
  );
});

test('origem CNAB e Banese exige evidência de liquidação, não mera emissão', () => {
  assert.match(rpc, /receivable\.status\s*=\s*'PAGO'/i);
  assert.match(
    rpc,
    /gateway_settlement_source[\s\S]{0,180}in\s*\(\s*'CNAB'\s*,\s*'CNAB240'\s*\)[\s\S]{0,240}then\s+'CNAB240'/i,
  );
  assert.doesNotMatch(rpc, /\bgateway_submission_channel\b|\bgateway_cnab_file_id\b/i);
  assert.match(
    rpc,
    /gateway_provider\s*=\s*'banese_card'[\s\S]{0,240}gateway_status[\s\S]{0,240}'LIQUIDATED'[\s\S]{0,240}origem_pagamento[\s\S]{0,120}'BANESE'[\s\S]{0,120}then\s+'AUTOMATICA_BANESE'/i,
  );
});

test('comprovante legado não é reaproveitado em baixa manual ou histórica', () => {
  const proofGuard = rpc.match(
    /case\s+when\s+source\.origem\s+in\s*\([\s\S]*?\)\s+then\s+source\.gateway_receipt_url\s+else\s+null\s+end\s+as\s+comprovante_url/i,
  );
  assert.ok(proofGuard, 'Comprovante deve usar whitelist positiva de origens bancárias.');
  assert.match(
    proofGuard[0],
    /'AUTOMATICA_BANESE'\s*,\s*'CNAB240'\s*,\s*'MERCADO_PAGO'/i,
  );
  assert.doesNotMatch(
    proofGuard[0],
    /'MANUAL'|'HISTORICO_MIGRADO'/i,
  );
  assert.doesNotMatch(
    rpc,
    /['"]comprovante_url['"]\s*,\s*(?:source|receipt)\.gateway_receipt_url/i,
  );
});

test('ambiente é validado e restringe o universo a production ou sandbox', () => {
  assert.match(
    rpc,
    /v_environment\s+text\s*:=\s*lower\s*\([\s\S]{0,180}p_environment[\s\S]{0,180}'production'/i,
  );
  assert.match(
    rpc,
    /v_environment\s+not\s+in\s*\(\s*'production'\s*,\s*'sandbox'\s*\)/i,
  );
  const environmentScope = rpc.match(
    /and\s*\(\s*lower\s*\(receivable\.gateway_environment\)[\s\S]*?\n\s*\)\s*\n\s*and\s+not\s+exists/i,
  );
  assert.ok(environmentScope, 'Predicado de ambiente do feed ausente.');
  assert.match(
    environmentScope[0],
    /lower\s*\(receivable\.gateway_environment\)\s*=\s*v_environment/i,
  );
  assert.match(
    environmentScope[0],
    /origem_pagamento[\s\S]{0,160}in\s*\(\s*'PRESENCIAL'\s*,\s*'SISTEMA_ANTERIOR'\s*\)/i,
  );
  assert.match(
    environmentScope[0],
    /manual_settlement_id\s+is\s+not\s+null[\s\S]{0,120}manual_settlement_reversed_at\s+is\s+null/i,
  );
  assert.doesNotMatch(
    environmentScope[0],
    /gateway_environment\s+is\s+null\s+and\s+v_environment\s*=\s*'production'\s*\)/i,
  );
  if (/gateway_environment\s+is\s+null/i.test(environmentScope[0])) {
    assert.match(
      environmentScope[0],
      /gateway_provider\s+is\s+null/i,
      'Fallback sem environment deve excluir registros identificados como gateway.',
    );
  }
});

test('baixa manual usa a conta efetiva e histórico preserva proveniência sem hora', () => {
  assert.match(
    rpc,
    /receiving_account\.id\s*=\s*coalesce\s*\(\s*manual_settlement\.account_id\s*,\s*receivable\.conta_bancaria_id\s*\)/i,
  );
  assert.match(
    rpc,
    /case\s+when\s+source\.origem\s*=\s*'HISTORICO_MIGRADO'\s+then\s+'HISTORICO_SEM_HORA'[\s\S]{0,400}source\.gateway_settlement_recorded_at/i,
  );
});

test('paginação normaliza entradas e aplica teto absoluto de 100 itens', () => {
  const pageDeclaration = rpc.match(/v_page\s+integer\s*:=\s*([^;]+);/i);
  assert.ok(pageDeclaration, 'Página normalizada ausente.');
  assert.match(pageDeclaration[1], /greatest/i);
  assert.match(pageDeclaration[1], /p_page/i);
  assert.match(pageDeclaration[1], /\b1\b/);

  const pageSizeDeclaration = rpc.match(/v_page_size\s+integer\s*:=\s*([^;]+);/i);
  assert.ok(pageSizeDeclaration, 'Tamanho de página normalizado ausente.');
  assert.match(pageSizeDeclaration[1], /greatest/i);
  assert.match(pageSizeDeclaration[1], /least/i);
  assert.match(pageSizeDeclaration[1], /p_page_size/i);
  assert.match(pageSizeDeclaration[1], /\b100\b/);

  assert.match(
    rpc,
    /v_offset\s+bigint\s*:=\s*\(v_page::bigint\s*-\s*1\)\s*\*\s*v_page_size/i,
  );
  assert.match(rpc, /limit\s+v_page_size\b/i);
  assert.match(rpc, /offset\s+v_offset\b/i);
});

test('feed não consulta nem devolve o payload bancário bruto', () => {
  assert.doesNotMatch(rpc, /\braw_payload\b/i);
});

test('ordenação é estável entre pagamentos com o mesmo instante', () => {
  assert.match(
    rpc,
    /order\s+by\s+(?:[a-z_][a-z0-9_]*\.)?data_pagamento\s+desc\s*,\s*(?:[a-z_][a-z0-9_]*\.)?baixa_registrada_em\s+desc\s+nulls\s+last\s*,\s*(?:[a-z_][a-z0-9_]*\.)?id\s+desc/i,
  );
});
