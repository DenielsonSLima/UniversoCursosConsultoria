-- Synthetic database boundaries: production rendering, issuance wrapper and
-- immutable-snapshot trigger are loaded separately without network access.
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create schema extensions;
create schema internal_academic;
create function auth.role() returns text language sql stable as $$
  select coalesce(current_setting('request.jwt.claim.role', true), 'anon') $$;
create function extensions.unaccent(text) returns text language sql immutable as $$ select $1 $$;
create function public.is_gestor_for_polo(uuid) returns boolean language sql stable as $$
  select coalesce($1::text = current_setting('test.allowed_polo', true), false) $$;
create function public.gestor_has_tab(text,text) returns boolean language sql stable as $$
  select coalesce(current_setting('test.allowed_tab', true) = 'true', false) $$;
create function public.gestor_effective_permissions() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create function public.can_manage_secretaria_document(text,uuid) returns boolean language sql stable as $$
  select public.is_gestor_for_polo($2) and public.gestor_has_tab('secretaria', 'contratos-aluno') $$;
create function public.formatar_valor_brl_documento(numeric) returns text language sql immutable as $$
  select case when $1 is null then null else 'R$ ' || replace(to_char($1, 'FM999999990.00'), '.', ',') end $$;

create table public.parceiros (
  id uuid primary key, nome text, nome_social text, cpf_cnpj text, rg text, tipo_documento text,
  orgao_emissor text, rg_uf_emissao text, rg_data_emissao date, data_nascimento date,
  email text, telefone text, cep text, endereco text, numero text, complemento text,
  bairro text, cidade text, uf text, responsavel_nome text, responsavel_cpf text,
  responsavel_parentesco text, responsavel_telefone text, foto_url text, sexo text,
  nacionalidade text, naturalidade text, titulo_eleitor text, reservista text, nome_mae text,
  nome_pai text, escola_ensino_medio text, ano_conclusao_ensino_medio integer
);
create table public.empresas (
  id uuid primary key, nome_fantasia text, cnpj text, razao_social text,
  endereco text, numero text, complemento text, bairro text, cidade text, uf text,
  cep text, telefone text, email text, logo_url text, watermark_url text,
  watermark_opacity numeric, watermark_scale numeric, tipo text
);
create table public.polos (
  id uuid primary key, company_id uuid, nome text, cnpj text, endereco text,
  numero text, bairro text, cidade text, estado text, cep text, telefone text, email text,
  logo_url text, watermark_url text, watermark_opacity numeric, watermark_scale numeric,
  watermark_rotate boolean, is_matriz boolean
);
create table public.cursos (id uuid primary key, nome text, modalidade text, carga_horaria numeric);
create table public.turmas (
  id uuid primary key, polo_id uuid, curso_id uuid, nome text, codigo text, turno text,
  data_inicio date, data_previsao_termino date, qtd_parcelas integer,
  valor_matricula numeric, valor_rematricula numeric, valor_parcela numeric,
  dia_vencimento_padrao integer, desconto_pontualidade numeric, juros_atraso numeric,
  multa_atraso numeric, multa_atraso_percentual numeric
);
create table public.matriculas (
  id uuid primary key, aluno_id uuid, turma_id uuid, status text, data_matricula timestamptz,
  valor_matricula_individual numeric, valor_rematricula_individual numeric,
  valor_parcela_individual numeric, dia_vencimento_individual integer,
  data_primeiro_vencimento_financeiro date, desconto_pontualidade_individual numeric,
  juros_atraso_individual numeric, multa_atraso_individual numeric, multa_atraso_percentual_individual numeric
);
create table public.contas_receber (
  id uuid primary key default gen_random_uuid(), matricula_id uuid,
  descricao text, valor numeric, data_vencimento date, parcela_numero integer, status text
);
create table public.documentos_validacao (
  id uuid primary key default gen_random_uuid(), documento text, matricula_id uuid,
  aluno_id uuid, polo_id uuid, codigo text unique, status text default 'ATIVO',
  emitido_em timestamptz default now(), ultima_emissao_em timestamptz default now(),
  validade_ate timestamptz, quantidade_emissoes integer default 1,
  dados_emissao jsonb default '{}', updated_at timestamptz default now()
);
create table public.secretaria_documentos_emissao_requisicoes (
  request_id uuid primary key, tipo text, fingerprint text, resposta jsonb
);
create table public.documentos_modelos_configuracoes (
  template_key text, modalidade text, revisao integer, status text, conteudo jsonb
);
create table public.documentos_modelos_aprovacoes (
  id uuid primary key default gen_random_uuid(), template_key text, modalidade text,
  revisao integer, termo_confirmacao text
);
create table public.assinatura_eletronica_envelopes (
  id uuid primary key default gen_random_uuid(), documento_validacao_id uuid, status text
);

-- The ledger issuer itself is an unchanged external boundary. Its database
-- row and counters are real here; contract snapshot/render code is not stubbed.
create function public.emitir_documento_validacao_portal(text,uuid,text,text,timestamptz,uuid,boolean)
returns table(codigo text, emitido_em timestamptz) language plpgsql as $$
declare v_code text := 'TEST-CONTRACT-' || gen_random_uuid()::text;
begin
  return query insert into public.documentos_validacao(documento,matricula_id,aluno_id,polo_id,codigo)
    select $1, enrollment.id, enrollment.aluno_id, class.polo_id, v_code
    from public.matriculas enrollment join public.turmas class on class.id = enrollment.turma_id
    where enrollment.id = $2 returning documentos_validacao.codigo, documentos_validacao.emitido_em;
end $$;

insert into public.polos(id,nome,cnpj,is_matriz,cidade,estado,endereco,numero,bairro,cep,email,telefone)
values ('10000000-0000-0000-0000-000000000001','Instituição sintética','12345678000195',true,
  'Cidade','SE','Rua de Teste','1','Centro','49000000','school@example.invalid','79900000000'),
 ('10000000-0000-0000-0000-000000000002','Outro polo','98765432000110',false,
  'Cidade','SE','Rua de Teste','2','Centro','49000000','other@example.invalid','79900000000');
insert into public.cursos values
 ('20000000-0000-0000-0000-000000000001','Curso técnico sintético','TECNICO',1200);
insert into public.turmas(id,polo_id,curso_id,nome,codigo,turno,data_inicio,data_previsao_termino,qtd_parcelas,
  valor_matricula,valor_rematricula,valor_parcela,dia_vencimento_padrao,desconto_pontualidade)
values ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
 '20000000-0000-0000-0000-000000000001','Turma sintética','TESTE-A','Integral','2026-01-01','2028-01-01',12,100,100,279.90,15,19.90);
insert into public.parceiros(id,nome,cpf_cnpj,rg,tipo_documento,orgao_emissor,rg_uf_emissao,rg_data_emissao)
values ('40000000-0000-0000-0000-000000000001','ALUNO SINTETICO CIN','12345678909','12345678909','CIN','SSP','SE','2020-01-24'),
 ('40000000-0000-0000-0000-000000000002','ALUNO SINTETICO RG','98765432100','41394623','RG (ANTIGO)','SSP','SE','2020-01-24'),
 ('40000000-0000-0000-0000-000000000003','ALUNO SINTETICO CPF','00000000000',null,null,null,null,null);
insert into public.matriculas(id,aluno_id,turma_id,status,data_matricula,valor_parcela_individual)
select ('50000000-0000-0000-0000-' || lpad(number::text,12,'0'))::uuid,
 ('40000000-0000-0000-0000-' || lpad(number::text,12,'0'))::uuid,
 '30000000-0000-0000-0000-000000000001','ATIVO','2026-01-01',260
from generate_series(1,3) number;
insert into public.contas_receber(matricula_id,descricao,valor,data_vencimento,parcela_numero,status)
select id,'Parcela sintética',260,'2026-10-15',1,'PENDENTE' from public.matriculas;
insert into public.documentos_modelos_aprovacoes(template_key,modalidade,revisao,termo_confirmacao)
values ('contrato_aluno','TECNICO',7,'APROVADO_JURIDICAMENTE');
