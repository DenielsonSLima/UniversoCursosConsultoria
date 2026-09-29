-- Execute via MCP SQL após a migration. Nenhuma linha real de aluno é tocada.
-- Exercita função publicada em tabela TEMP, com role authenticated, e rollback.
BEGIN;
CREATE TEMP TABLE issuer_contract (id integer PRIMARY KEY, tipo text, orgao_emissor text, nome text);
INSERT INTO issuer_contract VALUES
  (1, 'Aluno', 'SSP/SE', 'LEGADO SINTÉTICO'),
  (2, 'Professor', 'LIVRE', 'PERFIL SINTÉTICO');
CREATE TRIGGER validate_issuer
  BEFORE INSERT OR UPDATE ON issuer_contract
  FOR EACH ROW EXECUTE FUNCTION public.validar_orgao_emissor_aluno();
GRANT SELECT, INSERT, UPDATE ON issuer_contract TO authenticated;
SET LOCAL ROLE authenticated;

DO $test$
DECLARE
  denied boolean;
BEGIN
  IF (SELECT count(*) FROM public.orgaos_emissores_identidade) <> 10 THEN
    RAISE EXCEPTION 'Catálogo autenticado inesperado';
  END IF;
  IF has_table_privilege('anon', 'public.orgaos_emissores_identidade', 'SELECT')
    OR has_table_privilege('authenticated', 'public.orgaos_emissores_identidade', 'INSERT')
    OR has_table_privilege('authenticated', 'public.orgaos_emissores_identidade', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.orgaos_emissores_identidade', 'DELETE') THEN
    RAISE EXCEPTION 'Grants excessivos';
  END IF;

  INSERT INTO issuer_contract VALUES (3, 'Aluno', 'SSP', 'VÁLIDO');
  INSERT INTO issuer_contract VALUES (4, 'Aluno', ' ', 'OPCIONAL');
  IF (SELECT orgao_emissor IS NOT NULL FROM issuer_contract WHERE id=4) THEN
    RAISE EXCEPTION 'Vazio não normalizado';
  END IF;
  UPDATE issuer_contract SET nome='EDITADO' WHERE id=1;
  IF (SELECT orgao_emissor FROM issuer_contract WHERE id=1) <> 'SSP/SE' THEN
    RAISE EXCEPTION 'Legado alterado';
  END IF;

  denied := false;
  BEGIN
    INSERT INTO issuer_contract VALUES (5, 'Aluno', 'TEXTO LIVRE', 'INVÁLIDO');
  EXCEPTION WHEN check_violation THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Insert inválido aceito'; END IF;

  denied := false;
  BEGIN
    UPDATE issuer_contract SET orgao_emissor='TEXTO LIVRE' WHERE id=3;
  EXCEPTION WHEN check_violation THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Update inválido aceito'; END IF;

  denied := false;
  BEGIN
    UPDATE issuer_contract SET tipo='Aluno' WHERE id=2;
  EXCEPTION WHEN check_violation THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Conversão inválida aceita'; END IF;

  UPDATE issuer_contract SET tipo='Aluno', orgao_emissor='SSP' WHERE id=2;
END;
$test$;

SELECT 'PASS: catálogo, grants, trigger autenticado, vazio, legado, insert/update/conversão' AS resultado;
ROLLBACK;
