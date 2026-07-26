-- Cursos EAD aceitam somente Pix e boleto. Mantém preço e demais regras
-- financeiras, removendo o cartão dos cursos existentes.
update public.cursos
set financeiro_config = coalesce(financeiro_config, '{}'::jsonb)
  || jsonb_build_object(
    'metodosRecebimento',
    coalesce(financeiro_config->'metodosRecebimento', '{}'::jsonb)
      || jsonb_build_object(
        'pix', true,
        'boleto', true,
        'cartao', false
      ),
    'cartao',
    coalesce(financeiro_config->'cartao', '{}'::jsonb)
      || jsonb_build_object(
        'aceitar', false,
        'maxParcelas', 1,
        'repassarCustoParcelamento', false
      )
  )
where upper(coalesce(modalidade, '')) = 'EAD'
  and (
    financeiro_config #>> '{metodosRecebimento,pix}' is distinct from 'true'
    or financeiro_config #>> '{metodosRecebimento,boleto}' is distinct from 'true'
    or financeiro_config #>> '{metodosRecebimento,cartao}' is distinct from 'false'
    or financeiro_config #>> '{cartao,aceitar}' is distinct from 'false'
    or financeiro_config #>> '{cartao,maxParcelas}' is distinct from '1'
    or financeiro_config #>> '{cartao,repassarCustoParcelamento}' is distinct from 'false'
  );
