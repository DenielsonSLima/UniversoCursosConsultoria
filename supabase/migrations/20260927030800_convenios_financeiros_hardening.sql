BEGIN;

-- As consultas e mutações públicas passam somente pelas RPCs autorizadas.
-- A tabela de idempotência permanece inacessível diretamente, agora com uma
-- política negativa explícita para documentar o contrato também no linter.
CREATE POLICY convenios_financeiros_operacoes_deny_direct_access
  ON public.convenios_financeiros_operacoes_requisicoes
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- O formato granular efetivo prevalece sobre o legado quando configurado.
DROP POLICY convenios_financeiros_select_scoped
  ON public.convenios_financeiros;
CREATE POLICY convenios_financeiros_select_scoped
  ON public.convenios_financeiros
  FOR SELECT
  TO authenticated
  USING (
    public.is_financeiro_for_polo(polo_id)
    AND public.gestor_has_effective_financeiro_tab('convenios')
  );

DROP POLICY convenios_financeiros_competencias_select_scoped
  ON public.convenios_financeiros_competencias;
CREATE POLICY convenios_financeiros_competencias_select_scoped
  ON public.convenios_financeiros_competencias
  FOR SELECT
  TO authenticated
  USING (
    public.is_financeiro_for_polo(polo_id)
    AND public.gestor_has_effective_financeiro_tab('convenios')
  );

DROP POLICY convenios_financeiros_creditos_select_scoped
  ON public.convenios_financeiros_creditos;
CREATE POLICY convenios_financeiros_creditos_select_scoped
  ON public.convenios_financeiros_creditos
  FOR SELECT
  TO authenticated
  USING (
    public.is_financeiro_for_polo(polo_id)
    AND public.gestor_has_effective_financeiro_tab('convenios')
  );

DROP POLICY convenios_financeiros_despesas_select_scoped
  ON public.convenios_financeiros_despesas;
CREATE POLICY convenios_financeiros_despesas_select_scoped
  ON public.convenios_financeiros_despesas
  FOR SELECT
  TO authenticated
  USING (
    public.is_financeiro_for_polo(polo_id)
    AND public.gestor_has_effective_financeiro_tab('convenios')
  );

DROP POLICY finance_realtime_events_select
  ON public.finance_realtime_events;
CREATE POLICY finance_realtime_events_select
  ON public.finance_realtime_events
  FOR SELECT
  TO authenticated
  USING (
    (aluno_id IS NOT NULL AND aluno_id = public.current_aluno_id())
    OR (
      (
        (polo_id IS NULL AND public.is_gestor_global())
        OR (polo_id IS NOT NULL AND public.is_gestor_for_polo(polo_id))
      )
      AND (
        public.gestor_has_module('caixa')
        OR public.gestor_has_module('relatorios')
        OR public.gestor_has_effective_financeiro_tab('resumo')
        OR public.gestor_has_effective_financeiro_tab('receber')
        OR public.gestor_has_effective_financeiro_tab('despesas')
        OR public.gestor_has_effective_financeiro_tab('convenios')
        OR public.gestor_has_effective_financeiro_tab('outros-debitos')
        OR public.gestor_has_effective_financeiro_tab('outros-creditos')
        OR public.gestor_has_tab('secretaria', 'recebimentos')
        OR public.gestor_has_tab('secretaria', 'dependencias-academicas')
        OR public.gestor_has_tab('secretaria', 'solicitacoes')
      )
    )
  );

-- Índices de cobertura dos FKs evitam varreduras em validações de update/delete
-- das entidades referenciadas e eliminam os avisos de performance do módulo.
CREATE INDEX convenios_financeiros_company_idx
  ON public.convenios_financeiros (company_id);
CREATE INDEX convenios_financeiros_parceiro_idx
  ON public.convenios_financeiros (parceiro_id)
  WHERE parceiro_id IS NOT NULL;
CREATE INDEX convenios_financeiros_competencias_company_idx
  ON public.convenios_financeiros_competencias (company_id);
CREATE INDEX convenios_financeiros_creditos_company_idx
  ON public.convenios_financeiros_creditos (company_id);
CREATE INDEX convenios_financeiros_creditos_conta_idx
  ON public.convenios_financeiros_creditos (conta_bancaria_id);
CREATE INDEX convenios_financeiros_creditos_convenio_idx
  ON public.convenios_financeiros_creditos (convenio_id);
CREATE INDEX convenios_financeiros_despesas_company_idx
  ON public.convenios_financeiros_despesas (company_id);
CREATE INDEX convenios_financeiros_despesas_convenio_idx
  ON public.convenios_financeiros_despesas (convenio_id);

COMMIT;
