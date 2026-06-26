ALTER TABLE public.documentos_validacao
  DROP CONSTRAINT IF EXISTS documentos_validacao_documento_check;

ALTER TABLE public.documentos_validacao
  ADD CONSTRAINT documentos_validacao_documento_check
  CHECK (documento IN (
    'carteirinha',
    'cracha_estagio',
    'declaracao_matricula',
    'declaracao_frequencia',
    'declaracao_irpf',
    'boletim',
    'atestado_conclusao_tecnico',
    'historico_escolar',
    'transferencia',
    'rematricula',
    'termo_estagio',
    'certificado_tecnico',
    'certificado_livre',
    'certificado_ead',
    'certificado_especializacao'
  ));

INSERT INTO public.documentos_validacao_politicas (
  documento,
  prefixo,
  escopo_identidade,
  validade_dias,
  exige_vinculo_ativo
)
VALUES (
  'atestado_conclusao_tecnico',
  'ATC-TEC',
  'MATRICULA',
  90,
  FALSE
)
ON CONFLICT (documento) DO UPDATE SET
  prefixo = EXCLUDED.prefixo,
  escopo_identidade = EXCLUDED.escopo_identidade,
  validade_dias = EXCLUDED.validade_dias,
  exige_vinculo_ativo = EXCLUDED.exige_vinculo_ativo,
  updated_at = now();
