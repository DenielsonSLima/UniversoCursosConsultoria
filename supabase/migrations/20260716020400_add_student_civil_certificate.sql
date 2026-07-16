begin;

alter table public.parceiros
  add column if not exists certidao_tipo text,
  add column if not exists certidao_modelo text,
  add column if not exists certidao_matricula text,
  add column if not exists certidao_termo text,
  add column if not exists certidao_livro text,
  add column if not exists certidao_folha text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'parceiros_certidao_civil_check'
      and conrelid = 'public.parceiros'::regclass
  ) then
    alter table public.parceiros
      add constraint parceiros_certidao_civil_check
      check (
        (
          certidao_tipo is null
          and certidao_modelo is null
          and certidao_matricula is null
          and certidao_termo is null
          and certidao_livro is null
          and certidao_folha is null
        )
        or (
          certidao_tipo in ('NASCIMENTO', 'CASAMENTO')
          and certidao_modelo = 'NOVO'
          and certidao_matricula ~ '^[0-9]{32}$'
          and substring(certidao_matricula from 15 for 1) = case certidao_tipo
            when 'NASCIMENTO' then '1'
            when 'CASAMENTO' then '2'
          end
          and certidao_termo is null
          and certidao_livro is null
          and certidao_folha is null
        )
        or (
          certidao_tipo in ('NASCIMENTO', 'CASAMENTO')
          and certidao_modelo = 'ANTIGO'
          and certidao_matricula is null
          and nullif(btrim(certidao_termo), '') is not null
          and nullif(btrim(certidao_livro), '') is not null
          and nullif(btrim(certidao_folha), '') is not null
        )
      ) not valid;
  end if;
end
$$;

alter table public.parceiros
  validate constraint parceiros_certidao_civil_check;

comment on column public.parceiros.certidao_tipo is
  'Tipo da certidão civil apresentada: NASCIMENTO ou CASAMENTO.';
comment on column public.parceiros.certidao_modelo is
  'Modelo da certidão civil apresentada: ANTIGO ou NOVO.';
comment on column public.parceiros.certidao_matricula is
  'Matrícula nacional de 32 dígitos usada nas certidões do modelo novo.';
comment on column public.parceiros.certidao_termo is
  'Número do termo da certidão civil no modelo antigo.';
comment on column public.parceiros.certidao_livro is
  'Número ou identificação do livro da certidão civil no modelo antigo.';
comment on column public.parceiros.certidao_folha is
  'Número da folha da certidão civil no modelo antigo.';

update public.documentos_aluno documento
set nome_documento = 'Certidão de Nascimento (modelo antigo ou novo) ou Certidão de Casamento',
    updated_at = now()
where documento.nome_documento = 'Certidão de Nascimento ou Casamento'
  and not exists (
    select 1
    from public.documentos_aluno existente
    where existente.aluno_id = documento.aluno_id
      and existente.nome_documento = 'Certidão de Nascimento (modelo antigo ou novo) ou Certidão de Casamento'
  );

create or replace function public.criar_checklist_documentos_aluno()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tipo = 'Aluno' then
    insert into public.documentos_aluno (aluno_id, nome_documento)
    values
      (new.id, 'RG / CNH (Frente e Verso)'),
      (new.id, 'CPF'),
      (new.id, 'Comprovante de Residência'),
      (new.id, 'Histórico Escolar / Certificado de Conclusão'),
      (new.id, 'Certidão de Nascimento (modelo antigo ou novo) ou Certidão de Casamento'),
      (new.id, 'Foto 3x4 Recente'),
      (new.id, 'Título de Eleitor (se maior de 18)'),
      (new.id, 'Certificado de Reservista (homens)'),
      (new.id, 'Declaração de Escolaridade')
    on conflict (aluno_id, nome_documento) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.criar_checklist_documentos_aluno() from public;

commit;
