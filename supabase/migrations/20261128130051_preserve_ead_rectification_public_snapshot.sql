BEGIN;

DO $migration$
DECLARE
  definition text := pg_get_functiondef('public.preparar_snapshot_publico_documento_validacao()'::regprocedure);
  declaration_anchor constant text := E'  v_numero_matricula text;\nbegin\n';
  replacement constant text := $snapshot$  v_numero_matricula text;
  v_original_ead public.documentos_validacao%ROWTYPE;
begin
  -- A new replacement may inherit the original disclosure policy once. Only
  -- the private correction ledger establishes the relationship; row changes
  -- by themselves cannot request a different snapshot.
  if tg_op = 'UPDATE' and old.documento = 'certificado_ead' and new.documento = old.documento
    and old.status = 'ATIVO' and new.status = old.status and new.codigo = old.codigo
    and new.identidade = old.identidade and new.matricula_id = old.matricula_id
    and new.aluno_id = old.aluno_id and new.polo_id is not distinct from old.polo_id
    and new.quantidade_emissoes = old.quantidade_emissoes
    and not (coalesce(old.dados_emissao, '{}'::jsonb) ? 'eadStudyPeriod')
    and new.dados_emissao #>> '{eadStudyPeriod,source}' = 'DOCUMENTARY_CORRECTION'
  then
    select original.* into v_original_ead
    from internal_academic.ead_certificate_period_corrections correction
    join public.documentos_validacao original on original.id = correction.previous_document_id
    where correction.replacement_document_id = new.id
      and correction.certificate_id::text = new.dados_emissao ->> 'certificateId'
      and correction.started_on::text = new.dados_emissao #>> '{eadStudyPeriod,startedOn}'
      and correction.completed_on::text = new.dados_emissao #>> '{eadStudyPeriod,completedOn}'
      and correction.completed_on::text = new.dados_emissao ->> 'completionDate'
      and original.documento = new.documento and original.status = 'REVOGADO'
      and original.matricula_id = new.matricula_id and original.aluno_id = new.aluno_id
      and original.polo_id is not distinct from new.polo_id;

    if found then
      new.politica_versao_emissao := v_original_ead.politica_versao_emissao;
      new.campos_publicos_emissao := v_original_ead.campos_publicos_emissao;
      new.validacao_publica := v_original_ead.validacao_publica and old.validacao_publica;
      new.dados_publicos_snapshot := public.filtrar_dados_publicos_validacao(
        (v_original_ead.dados_publicos_snapshot - array['code','validationCode','status','type'])
          || jsonb_build_object('code', new.codigo, 'issuedAt', new.emitido_em,
            'lastIssuedAt', new.ultima_emissao_em, 'issueCount', new.quantidade_emissoes)
          || case when v_original_ead.dados_publicos_snapshot ? 'completionDate'
            then jsonb_build_object('completionDate', new.dados_emissao -> 'completionDate') else '{}'::jsonb end,
        v_original_ead.campos_publicos_emissao
      );
      return new;
    end if;
  end if;
$snapshot$;
BEGIN
  IF length(definition) - length(replace(definition, declaration_anchor, '')) <> length(declaration_anchor) THEN
    RAISE EXCEPTION 'EAD_RECTIFICATION_PUBLIC_SNAPSHOT_DRIFT';
  END IF;
  EXECUTE replace(definition, declaration_anchor, replacement);
END $migration$;

COMMIT;
