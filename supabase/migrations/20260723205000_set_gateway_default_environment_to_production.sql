BEGIN;

-- Ajuste para forçar o ambiente de integração bancária de visão geral para produção,
-- refletindo a parametrização atual de rotas (Pix/Boleto no Banese em produção e
-- cartão no Mercado Pago em sandbox).
UPDATE public.asaas_config
SET environment = 'production',
    updated_at = now()
WHERE id = 'a1111111-1111-1111-1111-111111111111';

COMMIT;
