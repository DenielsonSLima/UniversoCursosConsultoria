-- Catálogo inicial revisado; não deriva opções de textos livres dos alunos.
-- Sigla e UF continuam separadas. Não reescreve valores ou snapshots legados.
-- Fontes institucionais consultadas em 2026-09-28:
-- https://www.ssp.se.gov.br/Servicos/InstitutoIdentificacao
-- https://www.se.gov.br/secom/noticia/rg_saiba_como_entrar_em_contato_com_o_instituto_de_identificacao_de_sergipe
-- https://detran.rj.gov.br/transparencia/institucional/historia-do-detran.html
-- https://atestadodic.detran.rj.gov.br/Apresentacao.aspx
-- https://www.policiacivil.mg.gov.br/pagina/servicos-identificacao
-- https://www.sds.pe.gov.br/images/media/1712166006_060%20BGSDS%20DE%2003ABR2024.pdf
-- https://www.igp.rs.gov.br/quem-somos

BEGIN;

CREATE TABLE public.orgaos_emissores_identidade (
  sigla text PRIMARY KEY CHECK (sigla ~ '^[A-Z][A-Z0-9]{1,19}$'),
  nome text NOT NULL CHECK (nullif(btrim(nome), '') IS NOT NULL),
  ativo boolean NOT NULL DEFAULT true
);

COMMENT ON TABLE public.orgaos_emissores_identidade IS
  'Catálogo controlado de órgãos emissores; novas opções somente por migration revisada.';

INSERT INTO public.orgaos_emissores_identidade (sigla, nome) VALUES
  ('SSP', 'Secretaria de Segurança Pública'),
  ('IIWSG', 'Instituto de Identificação Papiloscopista Wendel da Silva Gonzaga'),
  ('DETRAN', 'Departamento de Trânsito'),
  ('IFP', 'Instituto Félix Pacheco'),
  ('IIFP', 'Instituto de Identificação Félix Pacheco'),
  ('PC', 'Polícia Civil'),
  ('PCMG', 'Polícia Civil de Minas Gerais'),
  ('SDS', 'Secretaria de Defesa Social'),
  ('IITB', 'Instituto de Identificação Tavares Buril'),
  ('IGP', 'Instituto-Geral de Perícias');

ALTER TABLE public.orgaos_emissores_identidade ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.orgaos_emissores_identidade
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.orgaos_emissores_identidade
  TO authenticated, service_role;

-- Não contém dados de alunos; leitura necessária também ao autocadastro logado.
CREATE POLICY orgaos_emissores_identidade_leitura
  ON public.orgaos_emissores_identidade
  FOR SELECT TO authenticated
  USING (ativo);

CREATE FUNCTION public.validar_orgao_emissor_aluno()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.tipo IS DISTINCT FROM 'Aluno' THEN
    RETURN NEW;
  END IF;

  -- Permite editar outros dados sem reclassificar órgão histórico desconhecido.
  -- Converter outro perfil em aluno, porém, sempre exige catálogo ou vazio.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.tipo = 'Aluno'
      AND NEW.orgao_emissor IS NOT DISTINCT FROM OLD.orgao_emissor THEN
      RETURN NEW;
    END IF;
  END IF;

  NEW.orgao_emissor := nullif(btrim(NEW.orgao_emissor), '');
  IF NEW.orgao_emissor IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.orgaos_emissores_identidade AS orgao
    WHERE orgao.sigla = NEW.orgao_emissor AND orgao.ativo
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Selecione um órgão emissor da lista.',
      CONSTRAINT = 'parceiros_orgao_emissor_catalogo';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.validar_orgao_emissor_aluno()
  FROM PUBLIC, anon, authenticated, service_role;

-- Executa depois da compatibilidade de classificação de parceiros.
CREATE TRIGGER zz40_validar_orgao_emissor_aluno
  BEFORE INSERT OR UPDATE ON public.parceiros
  FOR EACH ROW EXECUTE FUNCTION public.validar_orgao_emissor_aluno();

COMMIT;
