alter table public.comunicacao_atendimento_config
  alter column horarios set default
  '{"0":{"ativo":false,"inicio":"00:00","fim":"00:00"},"1":{"ativo":true,"inicio":"08:00","fim":"17:00"},"2":{"ativo":true,"inicio":"08:00","fim":"17:00"},"3":{"ativo":true,"inicio":"08:00","fim":"17:00"},"4":{"ativo":true,"inicio":"08:00","fim":"17:00"},"5":{"ativo":true,"inicio":"08:00","fim":"17:00"},"6":{"ativo":true,"inicio":"08:00","fim":"16:00"},"feriados":{"ativo":false,"inicio":"00:00","fim":"00:00"}}'::jsonb;

insert into public.comunicacao_atendimento_config (polo_id, horarios)
select
  p.id,
  '{"0":{"ativo":false,"inicio":"00:00","fim":"00:00"},"1":{"ativo":true,"inicio":"08:00","fim":"17:00"},"2":{"ativo":true,"inicio":"08:00","fim":"17:00"},"3":{"ativo":true,"inicio":"08:00","fim":"17:00"},"4":{"ativo":true,"inicio":"08:00","fim":"17:00"},"5":{"ativo":true,"inicio":"08:00","fim":"17:00"},"6":{"ativo":true,"inicio":"08:00","fim":"16:00"},"feriados":{"ativo":false,"inicio":"00:00","fim":"00:00"}}'::jsonb
from public.polos p
where lower(coalesce(p.status, 'ativo')) = 'ativo'
on conflict (polo_id) do update
set
  horarios = excluded.horarios,
  updated_at = now();
