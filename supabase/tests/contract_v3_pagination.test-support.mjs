import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const version = 'CONTRATO_A4_INSTITUCIONAL_V3_MINUTA_COMPLETA';
export const sql = (name) => readFileSync(resolve('supabase/migrations', name), 'utf8');
export const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
export const plain = (value) => value.replace(/\\r\\n|\\n/gu, '\n').replace(/\s+/gu, ' ').trim();
export const extractFunction = (source, name) => {
  const start = source.toLowerCase().indexOf(`create or replace function public.${name}(`);
  if (start < 0) throw new Error(`Função não localizada: ${name}`);
  const end = source.indexOf('$function$;', start);
  return source.slice(start, end + '$function$;'.length);
};

export async function createDatabase() {
  const modulePath = process.env.PGLITE_MODULE_PATH;
  const { PGlite } = await import(modulePath
    ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema extensions;
    create function auth.role() returns text language sql stable
      as $$ select 'authenticated'::text $$;
    create function public.can_manage_secretaria_document(text,uuid) returns boolean
      language sql stable as $$
      select coalesce(current_setting('test.authorized',true),'false')::boolean
        and $2 = '${id(1)}'::uuid $$;
    create function public.is_gestor_for_polo(uuid) returns boolean language sql stable
      as $$ select public.can_manage_secretaria_document('contrato_aluno',$1) $$;
    create function public.gestor_has_tab(text,text) returns boolean language sql stable
      as $$ select coalesce(current_setting('test.history',true),'false')::boolean $$;
    create function public.gestor_effective_permissions() returns jsonb language sql stable
      as $$ select '{}'::jsonb $$;
    create function extensions.unaccent(text) returns text language sql immutable
      as $$ select $1 $$;
    create table public.secretaria_documentos_emissao_requisicoes(
      request_id uuid,tipo text,fingerprint text,resposta jsonb);
    create table public.documentos_modelos_configuracoes(
      template_key text,modalidade text,status text,revisao integer,conteudo jsonb);
    create table public.documentos_validacao(
      id uuid,codigo text,documento text,polo_id uuid,status text,
      ultima_emissao_em timestamptz,dados_emissao jsonb,aluno_id uuid,matricula_id uuid);
    create table public.parceiros(
      id uuid,nome text,cpf_cnpj text,rg text,data_nascimento date,foto_url text,
      sexo text,nacionalidade text,naturalidade text,orgao_emissor text,titulo_eleitor text,
      reservista text,nome_mae text,nome_pai text,escola_ensino_medio text,
      ano_conclusao_ensino_medio int);
    create table public.matriculas(id uuid,status text,turma_id uuid);
    create table public.turmas(id uuid,nome text,codigo text);
  `);
  await db.exec(extractFunction(sql('20260809110000_make_contrato_aluno_emission_canonical.sql'),
    'preparar_emissao_contrato_aluno_secure'));
  await db.exec(extractFunction(sql('20260730034051_make_secretaria_searches_accent_insensitive.sql'),
    'search_secretaria_emissions_secure'));
  await db.exec(`
    revoke all on function public.preparar_emissao_contrato_aluno_secure(uuid,text,uuid[],text,uuid)
      from public, anon;
    grant execute on function public.preparar_emissao_contrato_aluno_secure(uuid,text,uuid[],text,uuid)
      to authenticated, service_role;
    revoke all on function public.search_secretaria_emissions_secure(uuid,text,uuid,text,integer,integer)
      from public, anon;
    grant execute on function public.search_secretaria_emissions_secure(uuid,text,uuid,text,integer,integer)
      to authenticated, service_role;
  `);
  await db.exec(extractFunction(sql('20260810095500_compact_full_contract_to_seven_pages.sql'),
    'paginar_contrato_aluno_minuta_completa'));
  return db;
}

export function fixture() {
  const source = sql('20260809210000_create_full_technical_contract_draft.sql');
  const body = source.match(/'corpo', \$minuta\$\n([\s\S]*?)\n\$minuta\$,/u)?.[1];
  if (!body) throw new Error('Minuta versionada não localizada.');
  return {
    emissionId: 'CON-QA-SINTETICO', documentId: null,
    title: 'Contrato sintético de regressão', targetName: 'Pessoa de Teste',
    validationCode: 'CON-QA-SINTETICO', validationUrl: null, validUntil: null,
    fileUrl: null, statusLabel: null,
    renderPayload: {
      template: { presentationVersion: version, corpo: body, marcaDagua: { habilitada: true } },
      templateRevision: 4,
      snapshot: {
        instituicao: { presentationVersion: version, nome: 'Instituição de Teste',
          razaoSocial: 'Instituição de Teste Ltda.', cnpj: '00.000.000/0000-00',
          endereco: 'Rua Sintética', numero: '100', cidade: 'Cidade de Teste', uf: 'EX' },
        curso: { nome: 'Técnico de Teste', modalidade: 'TECNICO' },
      },
      rendered: {
        kind: 'CONTRATO_ALUNO', pageSize: 'A4_RETRATO', pages: [],
        watermark: { enabled: true, label: 'TESTE', opacity: 0.06, scale: 70, rotate: false },
        qr: { enabled: true, label: 'Validação sintética', validityLabel: 'Sem vencimento' },
      },
    },
  };
}

export const closing = 'Cidade de Teste, 07/10/2026.\n\nCONTRATANTE: ____________________\n'
  + 'CONTRATADA: ____________________\n\nTestemunha 1: ____________________\n'
  + 'Testemunha 2: ____________________';
export const page = (body, footer = null) => ({
  header: 'Minuta sintética', title: 'Contrato de Prestação de Serviços Educacionais', body, footer,
});
