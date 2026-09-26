import { readFile } from 'node:fs/promises';

const uuid = (suffix) => `00000000-0000-0000-0000-${suffix.padStart(12, '0')}`;
export const ids = Object.freeze({
  student: uuid('1'), student2: uuid('2'),
  enrollment: uuid('11'), enrollment2: uuid('12'),
  model: uuid('21'), polo: uuid('31'), issuer: uuid('41'),
  course: uuid('51'), course2: uuid('52'),
  turma: uuid('61'), turma2: uuid('62'), company: uuid('71'),
});

export const registrationPhotoMigration = (filename) => readFile(
  new URL(`../migrations/${filename}`, import.meta.url), 'utf8',
);

/**
 * Only the surrounding schema and identity providers are synthetic. The
 * document issuers, their ledger and both snapshot triggers come verbatim
 * from versioned migrations. Caller supplies a fresh PGlite with pgcrypto.
 */
export async function setupRegistrationPhotoFixture(db) {
  await db.exec(`
    create schema auth;
    create schema extensions;
    create schema internal_academic;
    create schema test_registration;
    create role anon;
    create role authenticated;
    create role service_role;
    create extension if not exists pgcrypto with schema extensions;

    create table test_registration.access_state (
      role_name text not null, allowed boolean not null, issuer_id uuid not null,
      allowed_polo_id uuid, student_id uuid
    );
    insert into test_registration.access_state values
      ('authenticated', true, '${ids.issuer}', '${ids.polo}', null);
    create function auth.role() returns text language sql stable as
      'select role_name from test_registration.access_state';
    create function auth.uid() returns uuid language sql stable as
      'select issuer_id from test_registration.access_state';
    create function public.current_aluno_id() returns uuid language sql stable as
      'select student_id from test_registration.access_state';
    create function public.can_manage_secretaria_document(text, uuid)
    returns boolean language sql stable as $stub$
      select allowed and role_name = 'authenticated'
        and ($2 = allowed_polo_id or allowed_polo_id is null)
      from test_registration.access_state
    $stub$;
    create function internal_academic.resolve_responsavel(uuid)
    returns uuid language plpgsql stable as $stub$
    declare access record;
    begin
      select * into access from test_registration.access_state;
      if not access.allowed then
        raise exception 'Synthetic identity denied' using errcode = '42501';
      end if;
      return case when access.role_name = 'service_role'
        then coalesce($1, access.issuer_id) else access.issuer_id end;
    end;
    $stub$;
    create table auth.users (id uuid primary key, email text not null);
    create table public.usuarios_sistema (
      id uuid primary key, email text not null, status text not null
    );
    insert into auth.users values ('${ids.issuer}', 'fixture@example.invalid');
    insert into public.usuarios_sistema values
      ('${ids.issuer}', 'fixture@example.invalid', 'ATIVO');

    create table public.empresas (
      id uuid primary key, endereco text, numero text, complemento text,
      bairro text, cidade text, uf text, cep text, telefone text, email text,
      logo_url text
    );
    create table public.polos (
      id uuid primary key, company_id uuid references public.empresas(id),
      nome text, cnpj text, endereco text, numero text, bairro text,
      cidade text, estado text, cep text, telefone text, email text,
      logo_url text, watermark_url text, watermark_opacity numeric,
      watermark_scale numeric, watermark_rotate boolean
    );
    create table public.parceiros (
      id uuid primary key, nome text, nome_social text, cpf_cnpj text,
      data_nascimento date, foto_url text, email text, telefone text,
      sexo text, estado_civil text, raca_cor text, rg text, tipo_documento text,
      orgao_emissor text, rg_uf_emissao text, rg_data_emissao date,
      nacionalidade text, naturalidade text, titulo_eleitor text,
      titulo_eleitor_zona text, titulo_eleitor_secao text,
      titulo_eleitor_data_emissao date, titulo_eleitor_uf text, reservista text,
      nome_mae text, nome_pai text, pcd boolean default false, pcd_tipo text,
      cep text, endereco text, numero text, complemento text, bairro text,
      cidade text, uf text, responsavel_nome text, responsavel_cpf text,
      responsavel_parentesco text, responsavel_telefone text, observacao text
    );
    create table public.cursos (
      id uuid primary key, nome text, modalidade text
    );
    create table public.turmas (
      id uuid primary key, polo_id uuid references public.polos(id),
      curso_id uuid references public.cursos(id), nome text, codigo text,
      turno text, status text, data_previsao_termino date
    );
    create table public.matriculas (
      id uuid primary key, aluno_id uuid references public.parceiros(id),
      turma_id uuid references public.turmas(id), status text,
      data_matricula date
    );
    create table public.modelos_fichas (
      id uuid primary key, nome text, tipo_curso text, status text,
      requer_assinatura boolean, texto_contrato text, campos_customizados jsonb,
      curso_especifico_id uuid, template_config jsonb
    );
    create table public.documentos_templates (
      id text primary key, conteudo jsonb
    );
    create table public.documentos_validacao_politicas (
      documento text primary key, escopo_identidade text not null,
      prefixo text not null, validade_dias integer,
      validacao_publica boolean not null, versao integer not null
    );
    create table public.documentos_validacao_politicas_historico (id bigint);
    create table public.documentos_validacao (
      id uuid primary key default gen_random_uuid(),
      identidade text not null unique, codigo text not null unique,
      documento text not null, matricula_id uuid not null,
      aluno_id uuid, polo_id uuid, periodo_referencia text, referencia_externa text,
      emitido_em timestamptz not null default now(),
      ultima_emissao_em timestamptz not null default now(), validade_ate timestamptz,
      status text not null default 'ATIVO', emitido_por uuid,
      quantidade_emissoes integer not null default 1,
      validacao_publica boolean not null default false,
      dados_emissao jsonb not null default '{}'::jsonb,
      revogado_em timestamptz, updated_at timestamptz not null default now()
    );
    insert into public.documentos_validacao_politicas values
      ('ficha_matricula', 'MATRICULA', 'FIC', null, false, 1),
      ('pasta_identificacao', 'MATRICULA', 'PAS', null, false, 1);
    insert into public.empresas (id, cidade, uf)
      values ('${ids.company}', 'CIDADE SINTETICA', 'SE');
    insert into public.polos
      (id, company_id, nome, cidade, estado, watermark_url,
       watermark_opacity, watermark_scale, watermark_rotate)
    values ('${ids.polo}', '${ids.company}', 'POLO SINTETICO',
      'CIDADE SINTETICA', 'SE', 'https://example.invalid/watermark.png', .17, 37, false);
    insert into public.parceiros (id, nome, foto_url, sexo) values
      ('${ids.student}', 'ALUNA SINTETICA A', null, 'F'),
      ('${ids.student2}', 'ALUNO SINTETICO B', null, 'M');
    insert into public.cursos values
      ('${ids.course}', 'CURSO SINTETICO A', 'TECNICO'),
      ('${ids.course2}', 'CURSO SINTETICO B', 'TECNICO');
    insert into public.turmas
      (id, polo_id, curso_id, nome, codigo, turno, status, data_previsao_termino)
    values
      ('${ids.turma}', '${ids.polo}', '${ids.course}', 'TURMA A', 'A',
       'INTEGRAL', 'EM_ANDAMENTO', '2027-12-31'),
      ('${ids.turma2}', '${ids.polo}', '${ids.course2}', 'TURMA B', 'B',
       'INTEGRAL', 'EM_ANDAMENTO', '2027-12-31');
    insert into public.matriculas values
      ('${ids.enrollment}', '${ids.student}', '${ids.turma}', 'ATIVO', '2026-01-01'),
      ('${ids.enrollment2}', '${ids.student2}', '${ids.turma2}', 'ATIVO', '2026-01-01');
  `);

  const template = {
    pageCount: 1,
    textContent: '<p>{{ALUNO_NOME}}</p>',
    absoluteFields: [{
      id: 'student_photo', type: 'image', value: '{{ALUNO_FOTO_URL}}',
      x: 76, y: 350, width: 100.5, height: 134,
      style: { border: '1px solid #94a3b8' },
    }],
  };
  await db.query(`insert into public.modelos_fichas values
    ($1, 'FICHA SINTETICA', 'TODOS', 'ATIVO', true, 'TERMO SINTETICO', '[]', null, $2)`,
  [ids.model, JSON.stringify(template)]);
  await db.query('insert into public.documentos_templates values ($1, $2)',
    ['pasta_identificacao_aluno', JSON.stringify(template)]);

  for (const filename of [
    '20260728073445_idempotent_document_reissue.sql',
    '20260809055000_fix_student_registration_voter_snapshot.sql',
    '20260809143000_freeze_student_registration_brand_snapshot.sql',
  ]) {
    await db.exec(await registrationPhotoMigration(filename));
  }
  return { ids, template };
}
