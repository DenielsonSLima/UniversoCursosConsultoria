import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// Cross-runtime contract: actual PostgreSQL JSON must price the shared Banese adapter.
// Everything is synthetic and isolated; no Supabase or bank request is made.
const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const db = new PGlite();
const temporary = await mkdtemp(join(tmpdir(), 'universo-other-credit-banese-'));
const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const polo = id(1), payer = id(3), actor = id(5);

try {
  const adapterPath = join(temporary, 'adapter.mjs');
  await build({
    stdin: {
      contents: `
        export { resolveBaneseReceivableFinancialTerms, buildConfiguredBaneseFinancialTerms }
          from './supabase/functions/gateways/api/banese-financial-terms.ts';
        export { mapBaneseFinancialTermsToPayload, formatBaneseFinancialTermsForPdf }
          from './supabase/functions/banese/internal/financial-terms.ts';
      `,
      resolveDir: process.cwd(), loader: 'ts',
    },
    outfile: adapterPath, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
  });
  const { resolveBaneseReceivableFinancialTerms, buildConfiguredBaneseFinancialTerms,
    mapBaneseFinancialTermsToPayload, formatBaneseFinancialTermsForPdf } =
    await import(pathToFileURL(adapterPath).href);
  await db.exec(source('other_credit_plans.fixture.sql'));
  for (const [key, value] of Object.entries({ uid: actor, polo, tab: 'true' })) {
    await db.query('SELECT set_config($1,$2,false)', [`test.${key}`, value]);
  }
  await db.query("INSERT INTO public.polos VALUES ($1,'ativo')", [polo]);
  await db.query("INSERT INTO public.usuarios_sistema(auth_user_id,status,perfil) VALUES ($1,'ativo','Financeiro')", [actor]);
  await db.query("INSERT INTO public.parceiros VALUES ($1,'Pagador sintético','ativo',$2,ARRAY[]::uuid[])", [payer, polo]);
  for (const file of [
    '20261013170000_other_credit_plans_schema.sql', '20261013170100_other_credit_plans_calculator.sql',
    '20261013170200_other_credit_plans_rpc.sql', '20261013170300_other_credit_plans_integrity.sql',
    '20261014010500_other_credit_plans_schedule.sql',
  ]) await db.exec(source(`../migrations/${file}`));

  const noAcademicLookup = { from() { throw new Error('Independent plan must not query a class or enrollment.'); } };
  for (const [index, discountType] of ['FIXO', 'PERCENTUAL'].entries()) {
    const input = {
      clienteId: payer, descricao: 'Prática avulsa sintética', quantidadeParcelas: 3,
      valorParcela: 100.25, primeiroVencimento: '2028-01-31',
      jurosMensalPercentual: 1.234567, multaPercentual: 2.5,
      descontoTipo: discountType, descontoValor: discountType === 'FIXO' ? 10.05 : 9.5,
      descontoDiasAntecedencia: 3, matricula: { valor: 35.5, vencimento: '2028-01-20' }, rematricula: null,
      periodicidade: 'DIAS_CORRIDOS_30',
      ...(index === 1 ? { parcelasPersonalizadas: [
        { numero: 1, valor: 85.01, vencimento: '2028-01-17' },
        { numero: 2, valor: 120.99, vencimento: '2028-03-05' },
        { numero: 3, valor: 230, vencimento: '2028-06-28' },
      ] } : {}),
    };
    const result = (await db.query(
      'SELECT public.criar_outros_creditos_plano_secure($1,$2,$3::jsonb) value',
      [id(100 + index), polo, JSON.stringify(input)],
    )).rows[0].value;
    for (const row of result.receivables) {
      assert.equal(row.forma_pagamento, 'BOLETO', 'The generic sync route can resolve the intended payment method');
      assert.equal(row.gateway_payment_method, 'BOLETO');
      assert.equal(row.gateway_provider, null, 'No bank registration is claimed by creating a plan');
      const canonical = result.plano.preview.parcelas.find(item => item.papel === row.outros_creditos_papel
        && item.numero === row.parcela_numero).financialTerms;
      const resolved = await resolveBaneseReceivableFinancialTerms(noAcademicLookup, row);
      assert.deepEqual(resolved, canonical, 'PostgreSQL terms reach the shared issuer intact');
      assert.equal(canonical.nominalAmount, Number(row.valor));
      assert.equal(canonical.dueDate, row.data_vencimento);
      assert.deepEqual(buildConfiguredBaneseFinancialTerms({ receivable: row, turma: { juros_atraso: 99 } }), canonical);
      const payload = mapBaneseFinancialTermsToPayload(resolved);
      assert.equal(payload.Juros.TipoJuroMora, 2);
      assert.equal(payload.Juros.Valor, input.jurosMensalPercentual);
      assert.equal(payload.Multa.TipoMulta, 2);
      assert.equal(payload.Multa.Valor, input.multaPercentual);
      assert.equal(payload.Juros.Data, canonical.interest.startsOn);
      if (row.outros_creditos_papel === 'PARCELA') {
        assert.equal(payload.Desconto[0].TipoDesconto, discountType === 'FIXO' ? 1 : 2);
        assert.equal(payload.Desconto[0].Valor, input.descontoValor);
        assert.equal(payload.Desconto[0].Data, canonical.discount.validUntil);
      } else {
        assert.equal(payload.Desconto, undefined, 'Optional fee never inherits installment discount');
      }
      const confirmed = { ...row, gateway_financial_terms: canonical, gateway_financial_terms_confirmed_at: '2028-01-01T10:00:00Z' };
      assert.deepEqual(await resolveBaneseReceivableFinancialTerms(noAcademicLookup, confirmed), canonical);
      await assert.rejects(() => resolveBaneseReceivableFinancialTerms(noAcademicLookup, {
        ...confirmed, gateway_financial_terms: { ...canonical, interest: { ...canonical.interest, value: 9 } },
      }), /snapshot financeiro incompatível/);
      await assert.rejects(() => resolveBaneseReceivableFinancialTerms(noAcademicLookup, {
        ...row, regra_financeira_outros_creditos_snapshot: null,
      }), /snapshot financeiro incompatível/, 'A missing snapshot fails instead of silently using zero terms');
    }
  }

  const independentInput = {
    clienteId: payer, descricao: 'Três políticas sintéticas', quantidadeParcelas: 1,
    valorParcela: 100, primeiroVencimento: '2028-03-01',
    jurosMensalPercentual: 1.234567, multaPercentual: 2.5,
    descontoTipo: 'FIXO', descontoValor: 10, descontoDiasAntecedencia: 3,
    matricula: { valor: 50, vencimento: '2028-02-10', condicoes: {
      jurosMensalPercentual: 0.5, multaPercentual: 1.75,
      descontoTipo: 'PERCENTUAL', descontoValor: 20, descontoDiasAntecedencia: 7,
    } },
    rematricula: { valor: 25, vencimento: '2028-04-20', condicoes: {
      jurosMensalPercentual: 2.75, multaPercentual: 3.5,
      descontoTipo: 'FIXO', descontoValor: 5.005, descontoDiasAntecedencia: 0,
    } },
  };
  const independent = (await db.query(
    'SELECT public.criar_outros_creditos_plano_secure($1,$2,$3::jsonb) value',
    [id(102), polo, JSON.stringify(independentInput)],
  )).rows[0].value;
  assert.equal(independent.plano.preview.totalComDesconto, 149.99);
  for (const row of independent.receivables) {
    const canonical = independent.plano.preview.parcelas.find(item => item.papel === row.outros_creditos_papel).financialTerms;
    const expected = row.outros_creditos_papel === 'PARCELA' ? independentInput
      : independent.plano.input[row.outros_creditos_papel === 'MATRICULA' ? 'matricula' : 'rematricula'].condicoes;
    const terms = await resolveBaneseReceivableFinancialTerms(noAcademicLookup, row);
    assert.deepEqual(terms, canonical);
    assert.deepEqual(buildConfiguredBaneseFinancialTerms({ receivable: row, turma: {
      juros_atraso: 99, aplicar_desconto_matricula: false, aplicar_multa_juros_rematricula: false,
    } }), canonical, 'Academic policies cannot override any independent role');
    const payload = mapBaneseFinancialTermsToPayload(terms);
    assert.equal(payload.Juros.Valor, expected.jurosMensalPercentual);
    assert.equal(payload.Multa.Valor, expected.multaPercentual);
    assert.equal(payload.Desconto[0].Valor, expected.descontoValor);
    assert.equal(payload.Desconto[0].TipoDesconto, expected.descontoTipo === 'FIXO' ? 1 : 2);
    assert.equal(payload.Desconto[0].Data, canonical.discount.validUntil);
    const instructions = formatBaneseFinancialTermsForPdf(terms);
    assert.equal(instructions.lines.length, 3, 'The existing PDF formatter includes all three canonical conditions');
    assert.match(instructions.discount, expected.descontoTipo === 'FIXO' ? /R\$/ : /%/);
    const confirmed = { ...row, gateway_financial_terms: canonical,
      gateway_financial_terms_confirmed_at: '2028-01-01T10:00:00Z' };
    assert.deepEqual(await resolveBaneseReceivableFinancialTerms(noAcademicLookup, confirmed), canonical);
    await assert.rejects(() => resolveBaneseReceivableFinancialTerms(noAcademicLookup, { ...confirmed,
      gateway_financial_terms: { ...canonical, discount: null },
    }), /snapshot financeiro incompatível/, 'Fee discounts remain protected by confirmed-term drift checks');
  }
  console.log('PASS PostgreSQL → shared Banese issuer: three independent policies, fixed/percentage discounts, precise interest/penalty, legacy fee fallback, existing PDF formatter, no academic lookup and confirmed-terms drift.');
} finally {
  await db.close();
  await rm(temporary, { recursive: true, force: true });
}
