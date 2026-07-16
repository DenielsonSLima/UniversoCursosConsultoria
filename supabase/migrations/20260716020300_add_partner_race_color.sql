alter table public.parceiros
  add column if not exists raca_cor text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'parceiros_raca_cor_check'
      and conrelid = 'public.parceiros'::regclass
  ) then
    alter table public.parceiros
      add constraint parceiros_raca_cor_check
      check (
        raca_cor is null
        or raca_cor in (
          'BRANCA',
          'PRETA',
          'PARDA',
          'AMARELA',
          'INDÍGENA',
          'PREFIRO NÃO INFORMAR'
        )
      ) not valid;
  end if;
end
$$;

alter table public.parceiros
  validate constraint parceiros_raca_cor_check;

comment on column public.parceiros.raca_cor is
  'Raça/cor autodeclarada do parceiro, conforme as categorias usadas no cadastro.';
