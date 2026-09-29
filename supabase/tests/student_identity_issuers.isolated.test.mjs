import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// PostgreSQL em memória, sem conexão ou dados de produção.
// Dependência opcional instalada fora do repositório, sem alterar o lockfile.
const modulePath = process.env.PGLITE_MODULE_PATH;
const packageUrl = modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite';
const { PGlite } = await import(packageUrl);
const db = new PGlite();
const migration = await readFile(new URL(
  '../migrations/20260929013437_create_student_identity_issuers.sql', import.meta.url,
), 'utf8');
let checks = 0;
const verify = (actual, expected) => { assert.deepEqual(actual, expected); checks += 1; };
const query = async (sql, params = []) => (await db.query(sql, params)).rows;
const rejects = async (sql, code) => {
  await assert.rejects(() => db.exec(sql), (error) => error.code === code);
  checks += 1;
};

try {
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE public.parceiros (
      id integer PRIMARY KEY, tipo text NOT NULL, orgao_emissor text, nome text
    );
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    GRANT SELECT, INSERT, UPDATE ON public.parceiros TO authenticated;
    INSERT INTO public.parceiros VALUES
      (1, 'Aluno', 'SSP/SE', 'LEGADO'),
      (2, 'Aluno', 'VALOR LEGADO DESCONHECIDO', 'LEGADO'),
      (3, 'Professor', 'VALOR LIVRE', 'OUTRO PERFIL');
  `);
  await db.exec(migration);
  verify((await query('SELECT count(*)::integer AS n FROM public.orgaos_emissores_identidade'))[0].n, 10);
  verify((await query(`SELECT proconfig, prosecdef FROM pg_proc
    WHERE oid = 'public.validar_orgao_emissor_aluno()'::regprocedure`))[0],
  { proconfig: ['search_path=""'], prosecdef: false });
  verify((await query(`SELECT has_function_privilege('authenticated',
    'public.validar_orgao_emissor_aluno()', 'EXECUTE') AS allowed`))[0].allowed, false);

  await db.exec('SET ROLE authenticated');
  verify((await query('SELECT count(*)::integer AS n FROM public.orgaos_emissores_identidade'))[0].n, 10);
  await rejects("INSERT INTO public.orgaos_emissores_identidade VALUES ('LIVRE', 'Livre', true)", '42501');
  await rejects("UPDATE public.orgaos_emissores_identidade SET nome='ALTERADO' WHERE sigla='SSP'", '42501');
  await rejects("DELETE FROM public.orgaos_emissores_identidade WHERE sigla='SSP'", '42501');
  await rejects("INSERT INTO public.parceiros VALUES (4, 'Aluno', 'TEXTO LIVRE', 'TESTE')", '23514');
  await rejects("INSERT INTO public.parceiros VALUES (4, 'Aluno', 'SSP/SE', 'TESTE')", '23514');
  await rejects("UPDATE public.parceiros SET orgao_emissor='LIVRE' WHERE id=1", '23514');
  await rejects("UPDATE public.parceiros SET tipo='Aluno' WHERE id=3", '23514');
  await db.exec(`
    INSERT INTO public.parceiros VALUES (4, 'Aluno', 'SSP', 'TESTE');
    INSERT INTO public.parceiros VALUES (5, 'Aluno', '   ', 'TESTE');
    INSERT INTO public.parceiros VALUES (6, 'Aluno', NULL, 'TESTE');
    INSERT INTO public.parceiros VALUES (7, 'Professor', 'LIVRE', 'TESTE');
    UPDATE public.parceiros SET nome='LEGADO EDITADO', orgao_emissor=orgao_emissor WHERE id IN (1,2);
  `);
  verify(await query('SELECT id,orgao_emissor FROM public.parceiros WHERE id IN (1,2,4,5,6) ORDER BY id'), [
    { id: 1, orgao_emissor: 'SSP/SE' },
    { id: 2, orgao_emissor: 'VALOR LEGADO DESCONHECIDO' },
    { id: 4, orgao_emissor: 'SSP' },
    { id: 5, orgao_emissor: null },
    { id: 6, orgao_emissor: null },
  ]);
  await db.exec("UPDATE public.parceiros SET orgao_emissor='DETRAN' WHERE id=1");
  verify((await query('SELECT orgao_emissor FROM public.parceiros WHERE id=1'))[0].orgao_emissor, 'DETRAN');
  await db.exec("UPDATE public.parceiros SET tipo='Aluno', orgao_emissor='SSP' WHERE id=3");
  verify((await query('SELECT tipo FROM public.parceiros WHERE id=3'))[0].tipo, 'Aluno');
  await db.exec("RESET ROLE; UPDATE public.orgaos_emissores_identidade SET ativo=false WHERE sigla='DETRAN'; SET ROLE authenticated");
  verify(await query("SELECT sigla FROM public.orgaos_emissores_identidade WHERE sigla='DETRAN'"), []);
  await rejects("INSERT INTO public.parceiros VALUES (8, 'Aluno', 'DETRAN', 'TESTE')", '23514');
  await db.exec("UPDATE public.parceiros SET nome='ÓRGÃO INATIVO PRESERVADO' WHERE id=1");
  verify((await query('SELECT orgao_emissor FROM public.parceiros WHERE id=1'))[0].orgao_emissor, 'DETRAN');
  await db.exec('RESET ROLE; SET ROLE anon');
  await rejects('SELECT * FROM public.orgaos_emissores_identidade', '42501');
  await db.exec('RESET ROLE; SET ROLE service_role');
  verify((await query('SELECT count(*)::integer AS n FROM public.orgaos_emissores_identidade'))[0].n, 10);
  await rejects("INSERT INTO public.orgaos_emissores_identidade VALUES ('LIVRE','Livre',true)", '42501');
  console.log(`${checks} verificações PostgreSQL: catálogo, RLS, permissões, trigger e legado aprovadas.`);
} finally {
  await db.close();
}
