alter table public.turmas
  add column if not exists instrucao_boleto_carne text
  not null
  default 'SR.(A) CAIXA: NÃO RECEBER ESTE TÍTULO APÓS 60 (SESSENTA) DIAS DO VENCIMENTO.';

alter table public.turmas
  drop constraint if exists turmas_instrucao_boleto_carne_length_check;

alter table public.turmas
  add constraint turmas_instrucao_boleto_carne_length_check
  check (
    char_length(btrim(instrucao_boleto_carne)) between 1 and 180
  );

comment on column public.turmas.instrucao_boleto_carne is
  'Instrução da turma impressa nos boletos e carnês de cursos técnicos.';
