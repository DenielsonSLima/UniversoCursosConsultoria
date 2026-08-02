alter table public.diario_notas
  alter column nota_p drop not null,
  alter column nota_ti drop not null,
  alter column nota_tg drop not null,
  alter column nota_s drop not null,
  alter column nota_cq drop not null,
  alter column nota_o drop not null;
