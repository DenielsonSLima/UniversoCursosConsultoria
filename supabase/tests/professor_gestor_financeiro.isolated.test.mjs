import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

// An isolated PostgreSQL WASM runtime. No production credentials or network.
const runtime = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(runtime ? pathToFileURL(resolve(runtime, 'dist/index.js')).href : '@electric-sql/pglite');
const id = value => `00000000-0000-0000-0000-${String(value).padStart(12, '0')}`;
const signature = 'public.parceiro_professor_financeiro_visualizacao(uuid,uuid,text,text,integer,integer)';

test('financeiro do professor autoriza fontes, separa origens e pagina no banco', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth; CREATE SCHEMA private; CREATE SCHEMA internal_proesc;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
        SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
      CREATE FUNCTION public.gestor_has_module(text) RETURNS boolean LANGUAGE sql AS $$
        SELECT $1 = ANY(string_to_array(current_setting('test.modules', true), ',')) $$;
      CREATE FUNCTION public.is_financeiro_for_polo(uuid) RETURNS boolean LANGUAGE sql AS $$
        SELECT current_setting('test.active', true) = 'yes' AND $1::text = current_setting('test.polo', true) $$;
      CREATE FUNCTION public.gestor_has_effective_financeiro_tab(text) RETURNS boolean LANGUAGE sql AS $$
        SELECT $1 = ANY(string_to_array(current_setting('test.tabs', true), ',')) $$;
      CREATE FUNCTION public.is_partner_in_gestor_scope(uuid, uuid[]) RETURNS boolean LANGUAGE sql AS $$
        SELECT $1::text = current_setting('test.polo', true)
          OR current_setting('test.polo', true)::uuid = ANY($2) $$;
      CREATE TABLE public.parceiros(id uuid PRIMARY KEY, tipo text, polo_id uuid, polo_ids uuid[]);
      CREATE TABLE public.despesas_lancamentos(
        id uuid PRIMARY KEY, fornecedor_id uuid, polo_id uuid, descricao text, valor numeric, valor_pago numeric,
        status text, data_vencimento date, data_pagamento date, forma_pagamento text, tipo text, valor_base numeric,
        juros_valor numeric, multa_valor numeric, desconto_valor numeric, observacao text,
        parcela_numero integer, total_parcelas integer, excluido_em timestamptz);
      CREATE TABLE public.contas_pagar(
        id uuid PRIMARY KEY, fornecedor_id uuid, polo_id uuid, descricao text, valor numeric, valor_pago numeric,
        status text, data_vencimento date, data_pagamento date, forma_pagamento text, categoria text, despesa_lancamento_id uuid);
      CREATE TABLE public.contas_receber(
        id uuid PRIMARY KEY, cliente_id uuid, polo_id uuid, descricao text, valor numeric, valor_pago numeric,
        status text, data_vencimento date, data_pagamento date, forma_pagamento text, categoria text,
        parcela_numero integer, matricula_id uuid, turma_id uuid, origem_cronograma_id uuid, tipo_lancamento text);
      CREATE TABLE public.inscricoes_online(receivable_id uuid);
      CREATE TABLE public.matricula_dependencia_cobrancas(conta_receber_id uuid);
      CREATE TABLE internal_proesc.obligation_links(receivable_id uuid);
      CREATE TABLE public.emprestimos_financeiros(conta_receber_id uuid);
      CREATE TABLE public.convenios_financeiros_creditos(conta_receber_id uuid);
      CREATE TABLE private.nfse_service_receivables(receivable_id uuid, operation_id uuid);
      CREATE TABLE private.nfse_individual_operations(id uuid PRIMARY KEY);
      GRANT USAGE ON SCHEMA public, auth TO authenticated;
      GRANT SELECT ON public.contas_receber TO authenticated;
      ALTER TABLE public.contas_receber ENABLE ROW LEVEL SECURITY;
      -- Deliberately no SELECT policy: the existing table policy must not turn
      -- authorized Outros Créditos into a false empty result for this RPC.
      SET test.uid = '${id(99)}'; SET test.polo = '${id(1)}'; SET test.active = 'yes';
      SET test.modules = 'parceiros,financeiro'; SET test.tabs = 'despesas,receber,outros-debitos,outros-creditos';
      INSERT INTO parceiros VALUES
        ('${id(2)}','Professor','${id(1)}','{}'), ('${id(3)}','Professor','${id(1)}','{}'),
        ('${id(4)}','Aluno','${id(1)}','{}'), ('${id(5)}','Professor','${id(9)}','{}');
      INSERT INTO despesas_lancamentos(id,fornecedor_id,polo_id,descricao,valor,valor_pago,status,tipo,data_vencimento,valor_base)
      VALUES ('${id(10)}','${id(2)}','${id(1)}','Honorários',100,0,'PENDENTE','DESPESA_VARIAVEL','2026-12-01',100),
        ('${id(11)}','${id(2)}','${id(1)}','Honorários pagos',200,200,'PAGO','DESPESA_VARIAVEL','2026-12-02',200),
        ('${id(12)}','${id(2)}','${id(1)}','Outro débito',150,null,'PENDENTE','OUTRO_DEBITO','2026-12-03',150),
        ('${id(13)}','${id(2)}','${id(1)}','Excluída',99,null,'PENDENTE','DESPESA_FIXA','2026-12-04',99),
        ('${id(14)}','${id(3)}','${id(1)}','Outro professor',99,null,'PENDENTE','DESPESA_FIXA','2026-12-04',99),
        ('${id(15)}','${id(2)}','${id(9)}','Outro polo',99,null,'PENDENTE','DESPESA_FIXA','2026-12-04',99);
      UPDATE despesas_lancamentos SET excluido_em = now() WHERE id = '${id(13)}';
      INSERT INTO contas_pagar(id,fornecedor_id,polo_id,descricao,valor,status,data_vencimento,despesa_lancamento_id)
      VALUES ('${id(20)}','${id(2)}','${id(1)}','Anterior',50,'PENDENTE','2026-12-01',null),
        ('${id(21)}','${id(2)}','${id(1)}','Espelho',100,'PENDENTE','2026-12-01','${id(10)}');
      INSERT INTO contas_receber(id,cliente_id,polo_id,descricao,valor,status,data_vencimento,categoria)
      VALUES ('${id(30)}','${id(2)}','${id(1)}','Mensalidade',100,'PENDENTE','2026-12-01','MENSALIDADE');
    `);
    for (let value = 31; value <= 40; value++) {
      await db.query(`INSERT INTO contas_receber(id,cliente_id,polo_id,descricao,valor,status,data_vencimento,categoria)
        VALUES ($1,$2,$3,$4,$5,$6,'2026-12-02','OUTROS_CREDITOS')`,
      [id(value), value === 39 ? id(3) : id(2), value === 40 ? id(9) : id(1), `Crédito ${value}`, value * 10, value === 31 ? 'SUSPENSO' : 'PENDENTE']);
    }
    await db.exec(`
      UPDATE contas_receber SET matricula_id='${id(90)}' WHERE id='${id(31)}';
      INSERT INTO private.nfse_individual_operations VALUES('${id(50)}');
      INSERT INTO private.nfse_service_receivables VALUES('${id(33)}','${id(50)}');
      UPDATE contas_receber SET turma_id='${id(91)}' WHERE id='${id(33)}';
      INSERT INTO convenios_financeiros_creditos VALUES('${id(34)}');
      INSERT INTO emprestimos_financeiros VALUES('${id(35)}');
      INSERT INTO inscricoes_online VALUES('${id(36)}');
      INSERT INTO matricula_dependencia_cobrancas VALUES('${id(37)}');
      INSERT INTO internal_proesc.obligation_links VALUES('${id(38)}');
    `);
    await db.exec(readFileSync(new URL('../migrations/20261114021000_professor_gestor_financeiro_read.sql', import.meta.url), 'utf8'));
    const privileges = (await db.query(`SELECT
      has_function_privilege('anon','${signature}','EXECUTE') AS anon,
      has_function_privilege('service_role','${signature}','EXECUTE') AS service,
      has_function_privilege('authenticated','${signature}','EXECUTE') AS authenticated,
      (SELECT prosecdef FROM pg_proc WHERE oid='${signature}'::regprocedure) AS definer,
      (SELECT proconfig FROM pg_proc WHERE oid='${signature}'::regprocedure) AS config`)).rows[0];
    assert.deepEqual([privileges.anon, privileges.service, privileges.authenticated, privileges.definer], [false, false, true, true]);
    assert.ok(privileges.config.includes('search_path=""'));
    await db.exec('SET ROLE authenticated');
    const read = async (source = 'despesas', status = 'todos', page = 1, pageSize = 10, professor = id(2), polo = id(1)) =>
      (await db.query('SELECT public.parceiro_professor_financeiro_visualizacao($1,$2,$3,$4,$5,$6) AS result',
        [professor, polo, source, status, page, pageSize])).rows[0].result;

    let result = await read();
    assert.equal(result.totalItems, 2);
    assert.deepEqual(result.items.map(item => item.id), [id(10), id(11)]);
    assert.equal(result.items[0].valor_pago, 0);
    assert.equal(result.items[0].multa_valor, null);
    assert.equal((await read('despesas', 'pagos')).items[0].valor_pago, 200);
    assert.equal((await read('outros-debitos')).items[0].id, id(12));
    assert.deepEqual((await read('historico')).items.map(item => item.id), [id(20)]);
    result = await read('mensalidades', 'abertos', 3, 2);
    assert.equal(result.totalItems, 5);
    assert.equal(result.items.length, 1);
    assert.equal(result.page, 3);
    assert.equal(result.pageSize, 2);
    assert.deepEqual((await read('servicos')).items.map(item => item.id), [id(33)]);
    assert.deepEqual((await read('outros-creditos')).items.map(item => item.id), [id(32)]);

    await db.exec("SET test.tabs='outros-creditos'");
    assert.equal((await db.query('SELECT count(*)::integer AS count FROM contas_receber')).rows[0].count, 0);
    assert.equal((await read('outros-creditos')).totalItems, 1);
    await assert.rejects(read('despesas'), /não autorizado/);
    await assert.rejects(read('servicos'), /não autorizado/);
    await assert.rejects(read('outros-creditos', 'todos', 1, 10, id(4)), /não autorizado/);
    await assert.rejects(read('outros-creditos', 'todos', 1, 10, id(5)), /não autorizado/);
    await assert.rejects(read('outros-creditos', 'todos', 1, 10, id(2), id(9)), /não autorizado/);
    await assert.rejects(read('outra-origem'), /Filtros financeiros inválidos/);
    await assert.rejects(read('outros-creditos', 'todos', 0), /Filtros financeiros inválidos/);
    await assert.rejects(read('outros-creditos', 'todos', 1, 26), /Filtros financeiros inválidos/);
    await db.exec("SET test.modules='financeiro'");
    await assert.rejects(read('outros-creditos'), /não autorizado/);
    await db.exec("SET test.modules='parceiros,financeiro'; SET test.active='no'");
    await assert.rejects(read('outros-creditos'), /não autorizado/);
    await db.exec("SET test.active='yes'; SET test.uid=''");
    await assert.rejects(read('outros-creditos'), /não autorizado/);
    await db.exec('RESET ROLE; SET ROLE anon');
    await assert.rejects(read('outros-creditos'), /permission denied/);
  } finally {
    await db.close();
  }
});
