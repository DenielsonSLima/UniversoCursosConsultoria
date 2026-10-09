import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const moduleName = process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href : '@electric-sql/pglite';
const { PGlite } = await import(moduleName);
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const migration = await read('../migrations/20261009130712_declaration_student_identity.sql');
const schema = await read('./fixtures/declaration-identity-schema.sql');
const poloA = '10000000-0000-0000-0000-000000000001';
const poloB = '10000000-0000-0000-0000-000000000002';
const enrollment = number => `50000000-0000-0000-0000-${String(number).padStart(12, '0')}`;
const student = number => `40000000-0000-0000-0000-${String(number).padStart(12, '0')}`;
const identityKeys = ['studentDocumentType', 'studentCpf', 'studentRg', 'studentRgIssuer', 'studentRgState', 'studentRgIssueDate'];
const identityOnly = data => Object.fromEntries(identityKeys.map(key => [key, data[key]]));
const searchSignature = 'public.search_secretaria_emissions_secure(uuid,text,uuid,text,integer,integer)';
const issueSignature = 'public.emitir_documento_validacao_interno(text,uuid,text,text,timestamp with time zone,uuid,boolean)';

test('production declaration identity migration preserves sources, snapshots and authorization', async t => {
  const db = new PGlite();
  const issue = async (number, type = 'declaracao_matricula', reissue = false) => {
    const result = await db.query(`select * from public.emitir_documento_validacao_interno(
      $1, $2, null, null, null, null, $3)`, [type, enrollment(number), reissue]);
    return result.rows[0];
  };
  const snapshot = async (number, type = 'declaracao_matricula') => (await db.query(
    'select dados_emissao from public.documentos_validacao where matricula_id = $1 and documento = $2',
    [enrollment(number), type],
  )).rows[0].dados_emissao;
  const search = async (polo = poloA) => (await db.query(
    'select public.search_secretaria_emissions_secure($1) as result', [polo],
  )).rows[0].result;
  const role = value => db.query("select set_config('request.jwt.claim.role', $1, false)", [value]);
  const reset = async () => {
    await db.exec(`truncate public.documentos_validacao;
      select set_config('app.document_reissue_authorized', '', false);
      select set_config('test.allowed_tab', 'false', false);
      select set_config('test.allowed_polo', '', false);`);
    await role('service_role');
  };
  const scenario = (name, body) => t.test(name, async () => { await reset(); await body(); });

  try {
    await db.exec(schema);
    // Recreate the preexisting ACL, then apply the actual CREATE OR REPLACE migration.
    for (const header of migration.match(/CREATE OR REPLACE FUNCTION[\s\S]*?(?=AS \$function\$)/g) || []) {
      await db.exec(`${header}AS $baseline$ begin raise exception 'Baseline stub'; end; $baseline$;`);
    }
    await db.exec(`revoke all on function ${searchSignature}, ${issueSignature} from public, anon, authenticated, service_role;
      grant execute on function ${searchSignature} to authenticated, service_role;
      grant execute on function ${issueSignature} to service_role;`);
    await db.exec(migration);

    await scenario('RG projection includes type, issuer, state and date for legacy emissions', async () => {
      await issue(1);
      await db.query('update public.documentos_validacao set dados_emissao = $1', [JSON.stringify({ studentName: 'ALUNO SINTETICO RG' })]);
      const response = await search();
      assert.equal(response.total, 1);
      const actual = response.items[0];
      assert.equal(actual.aluno.tipo_documento, 'RG (ANTIGO)');
      assert.equal(actual.aluno.rg, '1.234.567-X');
      assert.equal(actual.aluno.orgao_emissor, 'SSP');
      assert.equal(actual.aluno.rg_uf_emissao, 'SE');
      assert.equal(actual.aluno.rg_data_emissao, '2020-01-24');
      assert.deepEqual(actual.dados_emissao, { studentName: 'ALUNO SINTETICO RG' }, 'reading must not rewrite historical snapshots');
    });

    await scenario('new enrollment and frequency declarations freeze the complete individual identity', async () => {
      for (const type of ['declaracao_matricula', 'declaracao_frequencia']) {
        await issue(1, type);
        assert.deepEqual(identityOnly(await snapshot(1, type)), {
          studentDocumentType: 'RG (ANTIGO)', studentCpf: '12345678909', studentRg: '1.234.567-X',
          studentRgIssuer: 'SSP', studentRgState: 'SE', studentRgIssueDate: '2020-01-24',
        });
      }
    });

    await scenario('CIN and ambiguous legacy types are distinct and missing metadata is explicit null', async () => {
      for (const [number, type] of [[2, 'CIN'], [3, 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO']]) {
        await issue(number);
        const frozen = await snapshot(number);
        assert.equal(frozen.studentDocumentType, type);
        for (const key of identityKeys.filter(key => !['studentDocumentType', 'studentCpf'].includes(key))) {
          assert.ok(Object.hasOwn(frozen, key), `${key} must not disappear`);
          assert.equal(frozen[key], null);
        }
      }
      const response = await search();
      assert.equal(response.items[0].aluno.tipo_documento, 'CIN');
      assert.equal(response.items[0].aluno.rg, null);
    });

    await scenario('ordinary replay and explicit reissue preserve the original identity after registration changes', async () => {
      const first = await issue(2);
      const frozen = identityOnly(await snapshot(2));
      await db.query("update public.parceiros set tipo_documento = 'RG (ANTIGO)', rg = '9.999.999-X', orgao_emissor = 'SSP', rg_uf_emissao = 'SE' where id = $1", [student(2)]);
      try {
        const repeated = await issue(2);
        assert.equal(repeated.codigo, first.codigo);
        assert.equal(repeated.reutilizado, true);
        assert.deepEqual(identityOnly(await snapshot(2)), frozen);
        await db.exec("select set_config('app.document_reissue_authorized', 'on', false)");
        const reissued = await issue(2, 'declaracao_matricula', true);
        assert.equal(reissued.codigo, first.codigo);
        assert.equal(reissued.quantidade_emissoes, first.quantidade_emissoes + 1);
        assert.deepEqual(identityOnly(await snapshot(2)), frozen);
      } finally {
        await db.query("update public.parceiros set tipo_documento = 'CIN', rg = null, orgao_emissor = null, rg_uf_emissao = null where id = $1", [student(2)]);
      }
    });

    await scenario('unrelated fiscal/card documents keep their existing snapshot contracts', async () => {
      for (const type of ['declaracao_irpf', 'carteirinha']) {
        await issue(1, type);
        const actual = await snapshot(1, type);
        assert.equal(Object.hasOwn(actual, 'studentDocumentType'), false);
        assert.equal(Object.hasOwn(actual, 'studentRgIssuer'), false);
        assert.equal(actual.studentCpf, '12345678909');
        assert.equal(actual.cardIdentity, type === 'carteirinha' ? true : undefined);
      }
    });

    await scenario('insert-conflict path preserves explicit frozen null instead of overwriting with a concurrent snapshot', async () => {
      // Force the exact ON CONFLICT path reached when a concurrent issuer wins first.
      await db.exec(`create or replace function extensions.gen_random_bytes(length integer) returns bytea language plpgsql as $$
        begin
          if not exists (select 1 from public.documentos_validacao) then
            insert into public.documentos_validacao (identidade, codigo, documento, matricula_id, aluno_id, polo_id, dados_emissao)
            values ('declaracao_matricula:50000000-0000-0000-0000-000000000001:-:-', 'TEST-FROZEN-FIRST',
              'declaracao_matricula', '50000000-0000-0000-0000-000000000001',
              '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
              jsonb_build_object('studentDocumentType', null, 'studentRg', null, 'studentCpf', '00000000000'));
          end if;
          return decode(substring(md5(random()::text), 1, length * 2), 'hex');
        end;
      $$;`);
      try {
        const actual = await issue(1);
        assert.equal(actual.codigo, 'TEST-FROZEN-FIRST');
        assert.equal(actual.reutilizado, true);
        const frozen = await snapshot(1);
        assert.equal(frozen.studentDocumentType, null);
        assert.equal(frozen.studentRg, null);
        assert.equal(frozen.studentCpf, '00000000000');
        assert.equal(Object.hasOwn(frozen, 'studentRgIssuer'), false);
      } finally {
        await db.exec(`create or replace function extensions.gen_random_bytes(length integer)
          returns bytea language sql volatile as $$
          select decode(substring(md5(random()::text), 1, length * 2), 'hex') $$;`);
      }
    });

    await scenario('search denies anonymous and unauthorized staff, respects polo and preserves service access', async () => {
      await issue(1);
      await issue(3);
      for (const userRole of ['anon', 'authenticated']) {
        await role(userRole);
        await assert.rejects(search(), error => error.code === '42501');
      }
      await db.query("select set_config('test.allowed_polo', $1, false)", [poloA]);
      await assert.rejects(search(), error => error.code === '42501', 'polo without tab is insufficient');
      await db.exec("select set_config('test.allowed_tab', 'true', false)");
      const allowed = await search();
      assert.equal(allowed.total, 1);
      assert.equal(allowed.items[0].aluno.id, student(1));
      await assert.rejects(search(poloB), error => error.code === '42501');
      await role('service_role');
      assert.equal((await search(poloB)).items[0].aluno.id, student(3));
    });

    await scenario('guarded reissue rejects direct invocation and revoked/expired documents keep their protections', async () => {
      await issue(1);
      await assert.rejects(issue(1, 'declaracao_matricula', true), error => error.code === '22023');
      await db.exec("update public.documentos_validacao set status = 'REVOGADO'");
      await assert.rejects(issue(1), error => error.code === '55000');
      await db.exec("update public.documentos_validacao set status = 'ATIVO', validade_ate = now() - interval '1 day'");
      await assert.rejects(issue(1), error => error.code === '55000');
    });

    await scenario('security definer functions retain empty search paths and their original minimal ACLs', async () => {
      const actual = await db.query(`select proname, prosecdef, proconfig from pg_proc
        where pronamespace = 'public'::regnamespace and proname in
        ('search_secretaria_emissions_secure', 'emitir_documento_validacao_interno')`);
      assert.equal(actual.rows.length, 2);
      for (const row of actual.rows) {
        assert.equal(row.prosecdef, true);
        assert.deepEqual(row.proconfig, ['search_path=""']);
      }
      for (const [signature, authenticated] of [[searchSignature, true], [issueSignature, false]]) {
        const permissions = await db.query(`select
          has_function_privilege('anon', $1, 'EXECUTE') as anon,
          has_function_privilege('authenticated', $1, 'EXECUTE') as authenticated,
          has_function_privilege('service_role', $1, 'EXECUTE') as service`, [signature]);
        assert.deepEqual(permissions.rows[0], { anon: false, authenticated, service: true });
      }
    });
  } finally {
    await db.close();
  }
});
