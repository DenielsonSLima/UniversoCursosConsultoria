ALTER TABLE public.polos ADD COLUMN nome text,ADD COLUMN cnpj text,
 ADD COLUMN cidade text,ADD COLUMN estado text;
ALTER TABLE public.contas_bancarias ADD COLUMN banco text,ADD COLUMN titular text,
 ADD COLUMN agencia text,ADD COLUMN conta text,ADD COLUMN tipo text,ADD COLUMN natureza text,
 ADD COLUMN codigo_interno text,ADD COLUMN system_managed boolean,
 ADD COLUMN saldo_inicial numeric DEFAULT 0,ADD COLUMN data_saldo date;
CREATE FUNCTION public.can_access_conta_bancaria(uuid) RETURNS boolean
 LANGUAGE sql STABLE AS $$ SELECT true; $$;
ALTER TABLE public.contas_receber ADD COLUMN gateway_fee_value numeric,
 ADD COLUMN gateway_net_value numeric,ADD COLUMN asaas_fee_value numeric,ADD COLUMN asaas_net_value numeric;

CREATE TABLE public.transferencias_contas(id uuid,conta_origem_id uuid,conta_destino_id uuid,
 polo_id uuid,polo_destino_id uuid,tipo text,valor numeric,data_transferencia date);

ALTER TABLE public.contas_pagar ADD COLUMN fornecedor_id uuid,ADD COLUMN categoria text;
ALTER TABLE public.despesas_lancamentos ADD COLUMN fornecedor_id uuid,ADD COLUMN turma_id uuid,
 ADD COLUMN parcela_numero integer,ADD COLUMN total_parcelas integer;
ALTER TABLE public.parceiros ADD COLUMN nome text;
CREATE TABLE public.categorias_financeiras(id uuid,nome text);
CREATE TABLE public.turmas(id uuid,codigo text,nome text,curso_id uuid);
CREATE TABLE public.cursos(id uuid,nome text);
