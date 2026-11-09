-- Complemento da fixture descartável expense_clone_payment.fixture.sql; somente dados sintéticos.
ALTER TABLE public.polos
 ADD COLUMN nome text, ADD COLUMN cnpj text, ADD COLUMN cidade text, ADD COLUMN estado text,
 ADD COLUMN logo_url text, ADD COLUMN endereco text, ADD COLUMN numero text,
 ADD COLUMN complemento text, ADD COLUMN bairro text, ADD COLUMN cep text,
 ADD COLUMN telefone text, ADD COLUMN email text, ADD COLUMN watermark_url text,
 ADD COLUMN watermark_opacity numeric, ADD COLUMN watermark_scale integer, ADD COLUMN watermark_rotate boolean;
CREATE TABLE public.empresas(id uuid PRIMARY KEY,cnpj text,cidade text,uf text,logo_url text,
 endereco text,numero text,complemento text,bairro text,cep text,telefone text,email text);
CREATE TABLE public.parceiros(id uuid PRIMARY KEY,nome text,cpf_cnpj text);
CREATE TABLE public.categorias_financeiras(id uuid PRIMARY KEY,nome text);
CREATE TABLE public.contas_bancarias(id uuid PRIMARY KEY,natureza text,banco text,agencia text,conta text);
CREATE TABLE public.turmas(id uuid PRIMARY KEY,polo_id uuid,nome text,codigo text);
UPDATE public.polos SET nome='UNIDADE DEMONSTRAÇÃO', cidade='JAPOATÃ', estado='SE',
 logo_url='https://example.invalid/logo.png',watermark_url='https://example.invalid/marca.png',
 watermark_opacity=0.18,watermark_scale=82,watermark_rotate=false;
INSERT INTO public.parceiros VALUES('00000000-0000-0000-0000-000000000020','PARCEIRO DEMONSTRAÇÃO','000.000.000-00');
INSERT INTO public.turmas VALUES
 ('00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000001','ENFERMAGEM INTEGRAL','ENF T-42 INT'),
 ('00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000002','TURMA DE OUTRO POLO','OUTRO');
INSERT INTO public.despesas_lancamentos(id,polo_id,tipo,descricao,valor_base,data_vencimento,status,fornecedor_id,turma_id)
 VALUES('00000000-0000-0000-0000-000000000040','00000000-0000-0000-0000-000000000001',
 'DESPESA_VARIAVEL','SERVIÇO DEMONSTRAÇÃO',330,'2026-11-07','PAGO','00000000-0000-0000-0000-000000000020',
 '00000000-0000-0000-0000-000000000030');
