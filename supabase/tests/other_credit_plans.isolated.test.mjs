import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Actual PostgreSQL/WASM migrations, synthetic fixtures only; never connects to Supabase.
const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath
  ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const db = new PGlite();
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migrations = ['20261013170000_other_credit_plans_schema.sql',
  '20261013170100_other_credit_plans_calculator.sql', '20261013170200_other_credit_plans_rpc.sql',
  '20261013170300_other_credit_plans_integrity.sql',
  '20261014010500_other_credit_plans_schedule.sql'];
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const polo = id(1), otherPolo = id(2), payer = id(3), category = id(4), actor = id(5);
const input = (overrides = {}) => ({ clienteId: payer, descricao: 'Aulas de prática',
  categoriaFinanceiraId: category, quantidadeParcelas: 4, valorParcela: 100.25,
  primeiroVencimento: '2028-01-31', jurosMensalPercentual: 1, multaPercentual: 2,
  descontoTipo: 'PERCENTUAL', descontoValor: 10, descontoDiasAntecedencia: 3,
  matricula: { valor: 50, vencimento: '2028-01-20' },
  rematricula: { valor: 25, vencimento: '2028-06-10' }, ...overrides });
const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0].value;
const preview = (data = input(), scope = polo) => scalar(
  'SELECT public.preview_outros_creditos_plano_secure($1,$2::jsonb) value', [scope, JSON.stringify(data)]);
const create = (request = id(100), data = input(), scope = polo) => scalar(
  'SELECT public.criar_outros_creditos_plano_secure($1,$2,$3::jsonb) value',
  [request, scope, JSON.stringify(data)]);
const read = (planId = id(100)) => scalar('SELECT public.obter_outros_creditos_plano_secure($1) value', [planId]);
const count = () => scalar('SELECT count(*)::integer value FROM public.contas_receber');
const state = () => scalar(`SELECT md5(jsonb_build_object(
  'plans',(SELECT jsonb_agg(p ORDER BY id) FROM public.outros_creditos_planos p),
  'titles',(SELECT jsonb_agg(c ORDER BY id) FROM public.contas_receber c))::text) value`);
const denied = (call) => assert.rejects(call, (error) => error.code === '42501');
const invalid = (call) => assert.rejects(call, (error) => error.code === '22023');
const setting = (key, value) => db.query('SELECT set_config($1,$2,false)', [`test.${key}`, String(value)]);

try {
  await db.exec(source('other_credit_plans.fixture.sql'));
  await setting('uid', actor); await setting('polo', polo); await setting('tab', true);
  await db.query("INSERT INTO public.usuarios_sistema VALUES ($1,'financeiro','ativo')", [actor]);
  await db.query("INSERT INTO public.polos VALUES ($1,'ativo'),($2,'ativo')", [polo, otherPolo]);
  await db.query("INSERT INTO public.parceiros VALUES ($1,'Pagador sintético','ativo',$2,ARRAY[]::uuid[])", [payer, polo]);
  await db.query("INSERT INTO public.categorias_financeiras VALUES ($1,'OUTRO_CREDITO','ativo')", [category]);
  for (const file of migrations) {
    const sql = source(`../migrations/${file}`);
    assert.ok(sql.split('\n').length <= 500, file);
    await db.exec(sql);
  }

  const p = await preview();
  assert.deepEqual(p.parcelas.filter((x) => x.papel === 'PARCELA').map((x) => x.dataVencimento),
    ['2028-01-31', '2028-02-29', '2028-03-31', '2028-04-30']);
  assert.equal(p.totalParcelas, 401); assert.equal(p.totalTaxas, 75);
  assert.equal(p.totalNominal, 476); assert.equal(p.totalComDesconto, 435.88);
  assert.equal(p.parcelas[0].financialTerms.discount, null, 'Fees do not inherit installment discounts');
  assert.equal(p.parcelas[2].financialTerms.discount.validUntil, '2028-01-28');
  assert.equal(p.parcelas[2].financialTerms.interest.startsOn, '2028-02-01');
  assert.equal(p.parcelas[2].financialTerms.penalty.type, 'percentage');
  assert.equal(await count(), 0, 'Preview has no financial effects');
  const regular = await preview(input({ primeiroVencimento: '2027-01-31', matricula: null, rematricula: null }));
  assert.deepEqual(regular.parcelas.map((x) => x.dataVencimento),
    ['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
  const largest = await preview(input({ quantidadeParcelas: 60 }));
  assert.equal(largest.parcelas.length, 62, '60 installments plus two optional fees');
  assert.equal(largest.parcelas.at(-1).numero, 60);
  const rounded = await preview(input({ valorParcela: 99.995, descontoTipo: 'FIXO', descontoValor: 10.005 }));
  assert.equal(rounded.input.valorParcela, 100); assert.equal(rounded.input.descontoValor, 10.01);
  assert.equal(rounded.parcelas[2].valorComDesconto, 89.99);
  for (const patch of [
    { quantidadeParcelas: 0 }, { quantidadeParcelas: 61 }, { quantidadeParcelas: 1.5 },
    { valorParcela: 0 }, { valorParcela: -1 }, { valorParcela: 'NaN' },
    { valorParcela: 100000000 },
    { primeiroVencimento: '2028-02-30' }, { descricao: '' }, { descricao: {} }, { clienteId: 'invalid' },
    { jurosMensalPercentual: 100 }, { multaPercentual: 100 },
    { descontoTipo: 'PERCENTUAL', descontoValor: 100 },
    { descontoTipo: 'FIXO', descontoValor: 100.25 }, { descontoDiasAntecedencia: 61 },
    { matricula: { valor: 0, vencimento: '2028-01-10' } },
    { matricula: { valor: 100000000, vencimento: '2028-01-10' } },
    { rematricula: { valor: 20, vencimento: '2028-02-30' } },
    { rematricula: { valor: 20, vencimento: '9999-12-31' } },
    { turmaId: id(900) }, { parcelas: [{ valor: 1 }] },
  ]) await invalid(() => preview(input(patch)));

  // Apply the complete create statement with all titles in one transaction.
  const created = await create();
  assert.equal(created.replayed, false); assert.equal(created.plano.created_by, actor);
  assert.equal(created.plano.cliente_nome, 'Pagador sintético');
  assert.equal(created.receivables.length, 6); assert.equal(await count(), 6);
  for (const row of created.receivables) {
    assert.equal(row.status, 'PENDENTE'); assert.equal(row.categoria, 'OUTROS_CREDITOS');
    assert.equal(row.tipo_lancamento, 'OUTRO_CREDITO'); assert.equal(row.outros_creditos_plano_id, id(100));
    assert.equal(row.matricula_id, null); assert.equal(row.turma_id, null);
    assert.equal(row.origem_cronograma_id, null); assert.equal(row.gateway_provider, null);
    assert.equal(row.forma_pagamento, 'BOLETO'); assert.equal(row.gateway_payment_method, 'BOLETO');
    assert.equal(row.gateway_financial_terms, null); assert.equal(row.gateway_financial_terms_confirmed_at, null);
    assert.equal(row.regra_financeira_outros_creditos_snapshot.financialTerms.nominalAmount, Number(row.valor));
    assert.equal(row.regra_financeira_outros_creditos_snapshot.papel, row.outros_creditos_papel);
  }
  assert.deepEqual((await read()).receivables.map((x) => x.id), created.receivables.map((x) => x.id));
  const persisted = await state();
  const replay = await create(id(100), input({ descricao: '  Aulas  de prática  ' }));
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.receivables.map((x) => x.id), created.receivables.map((x) => x.id));
  assert.equal(await state(), persisted, 'Normalized replay never duplicates or changes financial facts');
  for (const patch of [{ valorParcela: 101 }, { quantidadeParcelas: 3 }, { descontoValor: 5 },
    { matricula: null }, { primeiroVencimento: '2028-02-01' }]) {
    await invalid(() => create(id(100), input(patch)));
    assert.equal(await state(), persisted);
  }
  await db.query("UPDATE public.parceiros SET status='inativo' WHERE id=$1", [payer]);
  assert.equal((await create()).replayed, true, 'Committed request replays after payer lifecycle changes');
  await invalid(() => create(id(101)));
  await db.query("UPDATE public.parceiros SET status='ativo' WHERE id=$1", [payer]);
  await db.query("UPDATE public.parceiros SET polo_id=$1 WHERE id=$2", [otherPolo, payer]);
  await invalid(() => preview()); await invalid(() => create(id(101)));
  await db.query('UPDATE public.parceiros SET polo_id=null,polo_ids=ARRAY[$1::uuid] WHERE id=$2', [polo, payer]);
  assert.equal((await preview()).quantidadeParcelas, 4, 'Explicit multi-polo payer accepted');
  await db.query("UPDATE public.categorias_financeiras SET tipo='DESPESA' WHERE id=$1", [category]);
  await invalid(() => create(id(101)));
  await db.query("UPDATE public.categorias_financeiras SET tipo='OUTRO_CREDITO' WHERE id=$1", [category]);
  assert.equal(await state(), persisted, 'Rejected references do not leave plans or partial titles');

  // Read metadata is added after the pre-existing canonical list authorizes the scope.
  const list = await scalar('SELECT public.listar_outros_creditos_secure($1) value', [polo]);
  assert.equal(list.length, 6); assert.equal(list[0].outros_creditos_plano_id, id(100));
  await db.query('INSERT INTO public.convenios_financeiros_creditos VALUES($1)', [list[0].id]);
  assert.equal((await scalar('SELECT public.listar_outros_creditos_secure($1) value', [polo])).length, 5);

  for (const key of ['tab', 'uid', 'polo']) {
    await setting(key, key === 'tab' ? false : key === 'uid' ? '' : otherPolo);
    await denied(() => create()); await denied(() => read());
    await denied(() => preview());
    await setting('uid', actor); await setting('polo', polo); await setting('tab', true);
  }
  await denied(() => create(id(100), input(), otherPolo));
  assert.equal(await state(), persisted);
  await db.query("UPDATE public.usuarios_sistema SET perfil='professor' WHERE auth_user_id=$1", [actor]);
  await denied(() => create()); await denied(() => preview());
  assert.equal((await read()).plano.id, id(100), 'Read retains authorized tab/polo independently of write profile');
  await db.query("UPDATE public.usuarios_sistema SET perfil='financeiro' WHERE auth_user_id=$1", [actor]);
  await db.exec('SET ROLE anon'); await denied(() => preview()); await denied(() => create()); await denied(() => read());
  await db.exec('RESET ROLE');
  await db.exec('SET ROLE authenticated');
  await denied(() => db.query('SELECT * FROM public.outros_creditos_planos'));
  await denied(() => scalar('SELECT internal_finance.other_credit_plan_preview($1::jsonb) value', [JSON.stringify(input())]));
  assert.equal((await create()).replayed, true, 'Authenticated role uses guarded RPC without direct-table grants');
  await db.exec('RESET ROLE');

  const title = created.receivables[2].id;
  for (const assignment of ["valor=valor+1", "data_vencimento=data_vencimento+1", "cliente_id=null",
    "outros_creditos_plano_id=null", "regra_financeira_outros_creditos_snapshot='{}'::jsonb",
    "tipo_lancamento='PARCELA'", "matricula_id=id", "descricao='Changed'"]) {
    await invalid(() => db.query(`UPDATE public.contas_receber SET ${assignment} WHERE id=$1`, [title]));
  }
  await invalid(() => db.query('DELETE FROM public.contas_receber WHERE id=$1', [title]));
  await invalid(() => db.query("UPDATE public.outros_creditos_planos SET descricao='Changed' WHERE id=$1", [id(100)]));
  await invalid(() => db.query('DELETE FROM public.outros_creditos_planos WHERE id=$1', [id(100)]));
  assert.equal(await state(), persisted);
  await db.query("UPDATE public.contas_receber SET status='PAGO' WHERE id=$1", [title]);
  assert.equal((await read()).receivables.find((x) => x.id === title).status, 'PAGO', 'Settlement preserves original contract');

  // A failure at a late title proves the whole plan and every preceding title roll back.
  await db.exec(`CREATE FUNCTION public.test_reject_fourth_title() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.outros_creditos_plano_id='${id(101)}'::uuid AND NEW.parcela_numero=4
      THEN RAISE EXCEPTION 'Injected last-title failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER test_reject_fourth_title BEFORE INSERT ON public.contas_receber
      FOR EACH ROW EXECUTE FUNCTION public.test_reject_fourth_title();`);
  const beforeFailure = await state();
  await assert.rejects(() => create(id(101)), /Injected last-title failure/);
  assert.equal(await state(), beforeFailure, 'Atomic create leaves no partial rows or request records');
  const mutation = source('../migrations/20261013170200_other_credit_plans_rpc.sql');
  assert.ok(mutation.indexOf('PERFORM internal_finance.authorize_other_credit_plan(p_polo_id);',
    mutation.indexOf('CREATE FUNCTION public.criar')) < mutation.indexOf('SELECT * INTO v_existing'));
  assert.ok(mutation.indexOf('pg_advisory_xact_lock') < mutation.indexOf('SELECT * INTO v_existing'));
  console.log('PASS other credit plans: actual migrations, 31/leap calendar, 62 titles, fixed/% terms, fees, atomic rollback, replay, immutable identity, scope, ACL and list metadata.');
} finally { await db.close(); }
