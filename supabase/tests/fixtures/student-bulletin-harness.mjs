import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const studentId = '40000000-0000-0000-0000-000000000001';
export const enrollmentId = '50000000-0000-0000-0000-000000000001';
export const classId = '30000000-0000-0000-0000-000000000001';
export const moduleId = '60000000-0000-0000-0000-000000000001';
export const otherModuleId = '60000000-0000-0000-0000-000000000002';
export const futureModuleId = '60000000-0000-0000-0000-000000000003';
export const readBulletinFixture = path => readFile(new URL(path, import.meta.url), 'utf8');
export const migrations = [
  '../../migrations/20261011150000_canonical_academic_document_identity.sql',
  '../../migrations/20261011150100_student_bulletin_template_snapshot.sql',
  '../../migrations/20261011150200_student_bulletin_pdf.sql',
];

// Production issuer/core/formatter/RPC execute unchanged. Only existing dependency
// boundaries (Auth identity and already consolidated diary results) are synthetic.
export async function createStudentBulletinDatabase({ template } = {}) {
  const moduleName = process.env.PGLITE_MODULE_PATH
    ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href : '@electric-sql/pglite';
  const { PGlite } = await import(moduleName);
  const cryptoModule = process.env.PGLITE_MODULE_PATH
    ? new URL('./contrib/pgcrypto.js', moduleName).href : '@electric-sql/pglite/contrib/pgcrypto';
  const { pgcrypto } = await import(cryptoModule);
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await db.exec(await readBulletinFixture('./declaration-identity-schema.sql'));
    await db.exec(`CREATE SCHEMA test_crypto; CREATE EXTENSION pgcrypto WITH SCHEMA test_crypto;
      CREATE FUNCTION extensions.digest(text,text) RETURNS bytea LANGUAGE sql IMMUTABLE
      AS $digest$ SELECT test_crypto.digest($1,$2) $digest$;`);
    const boundary = await readBulletinFixture('./student-declaration-boundaries.sql');
    await db.exec(boundary.slice(0, boundary.indexOf('CREATE OR REPLACE FUNCTION public.emitir_')));
    await db.exec(await readBulletinFixture('./portal-academic-registration-formatter.sql') + ';');
    await db.exec(`
      ALTER TABLE public.cursos ADD COLUMN carga_horaria integer DEFAULT 1200;
      ALTER TABLE public.cursos ADD COLUMN area text;
      ALTER TABLE public.cursos ADD COLUMN eixo_tecnologico text;
      ALTER TABLE public.cursos ADD COLUMN perfil_profissional_conclusao text;
      ALTER TABLE public.turmas ADD COLUMN data_inicio timestamptz DEFAULT '2026-01-01';
      CREATE TABLE public.certificados_academicos (
        matricula_id uuid, status text, data_conclusao timestamptz, emitido_em timestamptz);
      CREATE TABLE public.modulos (
        id uuid PRIMARY KEY, nome text, ordem integer, created_at timestamptz DEFAULT now());
      CREATE TABLE public.disciplinas (
        id uuid PRIMARY KEY, modulo_id uuid, nome text, ordem integer, carga_horaria integer,
        carga_horaria_teoria integer, carga_horaria_pratica integer, carga_horaria_estagio integer,
        created_at timestamptz DEFAULT now());
      CREATE TABLE public.periodos_letivos (id uuid PRIMARY KEY, modulo_id uuid, turma_id uuid, status text);
      CREATE TABLE public.turmas_disciplinas (
        turma_id uuid, disciplina_id uuid, periodo_letivo_id uuid);
      CREATE TABLE public.matricula_componentes (
        matricula_id uuid, disciplina_id uuid, status text, tentativa_aprovada_id uuid);
      CREATE TABLE public.matricula_disciplina_tentativas (
        id uuid, numero_tentativa integer, turma_id uuid, status text);
      CREATE TABLE public.test_diary_results (
        disciplina_id uuid, media_final numeric, frequencia_percent numeric, resultado_final text);
      CREATE FUNCTION internal_academic.get_enrollment_results(uuid)
        RETURNS SETOF public.test_diary_results LANGUAGE sql STABLE AS $results$
        SELECT * FROM public.test_diary_results $results$;
      INSERT INTO public.documentos_validacao_politicas VALUES ('boletim','MATRICULA','TEST-BOL',30,true);
      INSERT INTO public.modulos(id,nome,ordem) VALUES
        ('${moduleId}','Módulo 1',1),('${otherModuleId}','Módulo 2',2),('${futureModuleId}','Futuro',3);
      INSERT INTO public.periodos_letivos VALUES
        ('${moduleId}','${moduleId}','${classId}','ABERTO'),('${otherModuleId}','${otherModuleId}','${classId}','FECHADO'),
        ('${futureModuleId}','${futureModuleId}','${classId}','PLANEJADO');
      INSERT INTO public.disciplinas(id,modulo_id,nome,ordem,carga_horaria) VALUES
        ('70000000-0000-0000-0000-000000000001','${moduleId}','Componente A',1,40),
        ('70000000-0000-0000-0000-000000000002','${moduleId}','Componente B',2,80),
        ('70000000-0000-0000-0000-000000000003','${otherModuleId}','Componente C',1,20),
        ('70000000-0000-0000-0000-000000000004','${futureModuleId}','Componente futuro',1,20);
      INSERT INTO public.turmas_disciplinas
        SELECT '${classId}',id,modulo_id FROM public.disciplinas;
      INSERT INTO public.test_diary_results VALUES
        ('70000000-0000-0000-0000-000000000001',8,90,'APROVADO'),
        ('70000000-0000-0000-0000-000000000002',6,75,'EM_RECUPERACAO'),
        ('70000000-0000-0000-0000-000000000003',10,100,'APROVADO');
    `);
    const issuer = await readBulletinFixture('../../migrations/20261009130712_declaration_student_identity.sql');
    const start = issuer.indexOf('CREATE OR REPLACE FUNCTION public.emitir_documento_validacao_interno(');
    const end = issuer.indexOf('$function$;', issuer.indexOf('AS $function$',start)) + '$function$;'.length;
    await db.exec(issuer.slice(start,end));
    await db.exec(`REVOKE ALL ON FUNCTION public.emitir_documento_validacao_interno(
      text,uuid,text,text,timestamptz,uuid,boolean) FROM PUBLIC,anon,authenticated;
      GRANT EXECUTE ON FUNCTION public.emitir_documento_validacao_interno(
        text,uuid,text,text,timestamptz,uuid,boolean) TO service_role;`);
    if (template !== undefined) {
      await db.query('INSERT INTO public.documentos_templates(id,conteudo) VALUES ($1,$2)', ['boletim_tecnico',template]);
    }
    for (const path of migrations) await db.exec(await readBulletinFixture(path));
    await db.exec(`SELECT set_config('request.jwt.claim.sub','${studentId}',false);
      SELECT set_config('request.jwt.claim.role','authenticated',false);`);
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

export async function issueBulletin(db, enrollment = enrollmentId, module = moduleId) {
  return (await db.query('SELECT public.obter_boletim_aluno_pdf($1,$2) AS source', [enrollment,module])).rows[0].source;
}

export const configuredBulletin = {
  textContent: "<p><b>DADOS ACADÊMICOS</b></p><p>Aluno(a): {{ALUNO_NOME}} &nbsp; Matrícula: {{ALUNO_MATRICULA}}</p><p>Curso técnico: {{CURSO_NOME}} &nbsp; Turma: {{TURMA_NOME}}</p><p>Módulos: {{MODULO_PERIODO}} &nbsp; Ano letivo: {{ANO_LETIVO}}</p><br><p><b>RESULTADO POR COMPONENTE CURRICULAR</b></p>{{TABELA_BOLETIM_TECNICO}}<br><p>Média geral: <b>{{MEDIA_GERAL}}</b> &nbsp; Frequência geral: <b>{{FREQUENCIA_GERAL}}</b></p><p>Situação: <b>{{SITUACAO_ACADEMICA}}</b></p><p class=\"text-sm\">Documento informativo sujeito à consolidação pela Secretaria Acadêmica.</p>",
  absoluteFields: [{ id: 'custom-signature', type: 'image', value: 'data:image/png;base64,SYNTHETIC',
    x: 200, y: 900, width: 180, height: 60, style: { opacity: 0.7 } },
  { id: 'qr', type: 'qr', x: 620, y: 990, width: 60 }],
  validityDays: 45, pageCount: 2, cover: { custom: 'cover' }, footer: { custom: 'footer' }, v: 3,
};
