import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const migration = await readFile(new URL('../migrations/20261115044718_professor_optional_pix_key_type.sql', import.meta.url), 'utf8');
const teacher = '11111111-1111-4111-8111-111111111111';
const otherTeacher = '22222222-2222-4222-8222-222222222222';
const company = '33333333-3333-4333-8333-333333333333';
const polo = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherPolo = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

test('tipo Pix opcional preserva legado, RLS e colunas fora do escopo', async t => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE authenticated;
      CREATE ROLE anon;
      CREATE TABLE public.parceiros (
        id uuid PRIMARY KEY, tipo text NOT NULL, nome text NOT NULL,
        polo_id uuid, polo_ids uuid[] DEFAULT '{}', chave_pix text
      );
      ALTER TABLE public.parceiros ENABLE ROW LEVEL SECURITY;
      CREATE FUNCTION public.is_partner_in_gestor_scope(p_polo_id uuid, p_polo_ids uuid[])
      RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT current_setting('test.modules',true)='parceiros'
          AND (current_setting('test.global',true)='yes'
            OR p_polo_id::text=current_setting('test.polo',true)
            OR current_setting('test.polo',true)::uuid=ANY(coalesce(p_polo_ids,'{}'::uuid[])))
      $$;
      CREATE POLICY portal_parceiros_select ON public.parceiros FOR SELECT TO authenticated USING (
        current_setting('test.modules',true) IN ('parceiros','financeiro')
      );
      CREATE POLICY portal_parceiros_update ON public.parceiros FOR UPDATE TO authenticated
        USING (public.is_partner_in_gestor_scope(polo_id,polo_ids))
        WITH CHECK (public.is_partner_in_gestor_scope(polo_id,polo_ids));
      GRANT USAGE ON SCHEMA public TO authenticated,anon;
      GRANT SELECT,UPDATE ON public.parceiros TO authenticated;
      INSERT INTO public.parceiros(id,tipo,nome,polo_id,chave_pix) VALUES
        ('${teacher}','Professor','PROFESSOR SINTÉTICO','${polo}','52998224725'),
        ('${otherTeacher}','Professor','OUTRO PROFESSOR SINTÉTICO','${otherPolo}',NULL),
        ('${company}','PJ','EMPRESA SINTÉTICA','${polo}',NULL);
    `);
    const before = (await db.query('SELECT id,to_jsonb(p) AS row FROM public.parceiros p ORDER BY id')).rows;
    const policiesBefore = (await db.query("SELECT policyname,cmd,roles,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename='parceiros' ORDER BY policyname")).rows;
    await db.exec(migration);

    await t.test('adiciona tipo nulo sem reinterpretar ou modificar chaves legadas', async () => {
      const after = (await db.query("SELECT id,to_jsonb(p)-'tipo_chave_pix' AS row,tipo_chave_pix FROM public.parceiros p ORDER BY id")).rows;
      assert.deepEqual(after.map(({ id, row }) => ({ id, row })), before);
      assert.ok(after.every(row => row.tipo_chave_pix === null));
      assert.deepEqual((await db.query("SELECT policyname,cmd,roles,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename='parceiros' ORDER BY policyname")).rows, policiesBefore);
      assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.parceiros'::regclass")).rows[0].relrowsecurity, true);
    });

    await t.test('gestor autorizado grava só campos Pix do Professor e pode limpar ambos', async () => {
      await db.exec(`SET ROLE authenticated; SET test.modules='parceiros'; SET test.global='no'; SET test.polo='${polo}'`);
      const rowBefore = (await db.query("SELECT to_jsonb(p)-ARRAY['chave_pix','tipo_chave_pix'] AS row FROM public.parceiros p WHERE id=$1", [teacher])).rows[0].row;
      assert.equal((await db.query("UPDATE public.parceiros SET tipo_chave_pix='EMAIL',chave_pix='professor@example.invalid' WHERE id=$1 AND tipo='Professor' RETURNING id", [teacher])).rows.length, 1);
      assert.deepEqual((await db.query("SELECT to_jsonb(p)-ARRAY['chave_pix','tipo_chave_pix'] AS row FROM public.parceiros p WHERE id=$1", [teacher])).rows[0].row, rowBefore);
      await db.query("UPDATE public.parceiros SET tipo_chave_pix=NULL,chave_pix=NULL WHERE id=$1 AND tipo='Professor'", [teacher]);
      assert.deepEqual((await db.query('SELECT tipo_chave_pix,chave_pix FROM public.parceiros WHERE id=$1', [teacher])).rows[0], { tipo_chave_pix: null, chave_pix: null });
      assert.equal((await db.query("UPDATE public.parceiros SET tipo_chave_pix='EMAIL',chave_pix='company@example.invalid' WHERE id=$1 AND tipo='Professor' RETURNING id", [company])).rows.length, 0);
      assert.equal((await db.query("UPDATE public.parceiros SET tipo_chave_pix='EMAIL',chave_pix='other@example.invalid' WHERE id=$1 AND tipo='Professor' RETURNING id", [otherTeacher])).rows.length, 0);
      await db.exec('RESET ROLE');
    });

    await t.test('financeiro somente leitura não ganha escrita Pix pela migration', async () => {
      await db.exec(`SET ROLE authenticated; SET test.modules='financeiro'; SET test.global='yes'; SET test.polo='${polo}'`);
      assert.equal((await db.query('SELECT id FROM public.parceiros WHERE id=$1', [teacher])).rows.length, 1);
      assert.equal((await db.query("UPDATE public.parceiros SET tipo_chave_pix='EMAIL',chave_pix='denied@example.invalid' WHERE id=$1 AND tipo='Professor' RETURNING id", [teacher])).rows.length, 0);
      await db.exec('RESET ROLE');
    });

    await t.test('anon não lê nem altera o cadastro', async () => {
      await db.exec('SET ROLE anon');
      await assert.rejects(db.query('SELECT chave_pix FROM public.parceiros WHERE id=$1', [teacher]), /permission denied/);
      await assert.rejects(db.query("UPDATE public.parceiros SET tipo_chave_pix=NULL,chave_pix=NULL WHERE id=$1", [teacher]), /permission denied/);
      await db.exec('RESET ROLE');
    });

    await t.test('restrições rejeitam tipo inexistente ou tipo sem chave, aceitando legado desconhecido', async () => {
      await assert.rejects(db.query("UPDATE public.parceiros SET tipo_chave_pix='PDF',chave_pix='arquivo' WHERE id=$1", [teacher]), /parceiros_tipo_chave_pix_allowed/);
      await assert.rejects(db.query("UPDATE public.parceiros SET tipo_chave_pix='EMAIL',chave_pix='  ' WHERE id=$1", [teacher]), /parceiros_typed_pix_requires_key/);
      await db.query("UPDATE public.parceiros SET tipo_chave_pix=NULL,chave_pix='LEGACY-UNKNOWN' WHERE id=$1", [teacher]);
      assert.deepEqual((await db.query('SELECT tipo_chave_pix,chave_pix FROM public.parceiros WHERE id=$1', [teacher])).rows[0], { tipo_chave_pix: null, chave_pix: 'LEGACY-UNKNOWN' });
    });
  } finally {
    await db.close();
  }
});
