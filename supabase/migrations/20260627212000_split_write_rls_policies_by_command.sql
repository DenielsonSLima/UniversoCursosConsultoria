-- Split write policies by command so permissive SELECT policies are not duplicated
-- by broad FOR ALL policies. The predicates are intentionally unchanged.

drop policy if exists "portal_asaas_config_global_write" on public.asaas_config;
create policy "portal_asaas_config_global_insert" on public.asaas_config for insert to authenticated with check (is_gestor_global());
create policy "portal_asaas_config_global_update" on public.asaas_config for update to authenticated using (is_gestor_global()) with check (is_gestor_global());
create policy "portal_asaas_config_global_delete" on public.asaas_config for delete to authenticated using (is_gestor_global());

drop policy if exists "portal_biblioteca_documentos_write" on public.biblioteca_documentos;
create policy "portal_biblioteca_documentos_insert" on public.biblioteca_documentos for insert to authenticated with check (is_gestor_for_polo(polo_id) or teacher_id = current_professor_id());
create policy "portal_biblioteca_documentos_update" on public.biblioteca_documentos for update to authenticated using (is_gestor_for_polo(polo_id) or teacher_id = current_professor_id()) with check (is_gestor_for_polo(polo_id) or teacher_id = current_professor_id());
create policy "portal_biblioteca_documentos_delete" on public.biblioteca_documentos for delete to authenticated using (is_gestor_for_polo(polo_id) or teacher_id = current_professor_id());

drop policy if exists "portal_biblioteca_pastas_write" on public.biblioteca_pastas;
create policy "portal_biblioteca_pastas_insert" on public.biblioteca_pastas for insert to authenticated with check (is_gestor() or teacher_id = current_professor_id());
create policy "portal_biblioteca_pastas_update" on public.biblioteca_pastas for update to authenticated using (is_gestor() or teacher_id = current_professor_id()) with check (is_gestor() or teacher_id = current_professor_id());
create policy "portal_biblioteca_pastas_delete" on public.biblioteca_pastas for delete to authenticated using (is_gestor() or teacher_id = current_professor_id());

drop policy if exists "portal_biblioteca_professor_quotas_global_write" on public.biblioteca_professor_quotas;
create policy "portal_biblioteca_professor_quotas_global_insert" on public.biblioteca_professor_quotas for insert to authenticated with check (is_gestor_global());
create policy "portal_biblioteca_professor_quotas_global_update" on public.biblioteca_professor_quotas for update to authenticated using (is_gestor_global()) with check (is_gestor_global());
create policy "portal_biblioteca_professor_quotas_global_delete" on public.biblioteca_professor_quotas for delete to authenticated using (is_gestor_global());

drop policy if exists "portal_categorias_global_write" on public.categorias;
create policy "portal_categorias_global_insert" on public.categorias for insert to authenticated with check (is_gestor_global());
create policy "portal_categorias_global_update" on public.categorias for update to authenticated using (is_gestor_global()) with check (is_gestor_global());
create policy "portal_categorias_global_delete" on public.categorias for delete to authenticated using (is_gestor_global());

drop policy if exists "portal_certificados_write_gestor" on public.certificados_academicos;
create policy "portal_certificados_insert_gestor" on public.certificados_academicos for insert to authenticated with check (is_gestor_for_polo(polo_id));
create policy "portal_certificados_update_gestor" on public.certificados_academicos for update to authenticated using (is_gestor_for_polo(polo_id)) with check (is_gestor_for_polo(polo_id));
create policy "portal_certificados_delete_gestor" on public.certificados_academicos for delete to authenticated using (is_gestor_for_polo(polo_id));

drop policy if exists "portal_comunicacao_categorias_write_global" on public.comunicacao_categorias;
create policy "portal_comunicacao_categorias_insert_global" on public.comunicacao_categorias for insert to authenticated with check (is_gestor_global());
create policy "portal_comunicacao_categorias_update_global" on public.comunicacao_categorias for update to authenticated using (is_gestor_global()) with check (is_gestor_global());
create policy "portal_comunicacao_categorias_delete_global" on public.comunicacao_categorias for delete to authenticated using (is_gestor_global());

drop policy if exists "portal_comunicacao_config_global_write" on public.comunicacao_config;
create policy "portal_comunicacao_config_global_insert" on public.comunicacao_config for insert to authenticated with check (is_gestor_global());
create policy "portal_comunicacao_config_global_update" on public.comunicacao_config for update to authenticated using (is_gestor_global()) with check (is_gestor_global());
create policy "portal_comunicacao_config_global_delete" on public.comunicacao_config for delete to authenticated using (is_gestor_global());

drop policy if exists "portal_config_checklist_estagio_write_global" on public.config_checklist_estagio;
create policy "portal_config_checklist_estagio_insert_global" on public.config_checklist_estagio for insert to authenticated with check (is_gestor_global());
create policy "portal_config_checklist_estagio_update_global" on public.config_checklist_estagio for update to authenticated using (is_gestor_global()) with check (is_gestor_global());
create policy "portal_config_checklist_estagio_delete_global" on public.config_checklist_estagio for delete to authenticated using (is_gestor_global());

drop policy if exists "portal_contas_bancarias_global_write" on public.contas_bancarias;
create policy "portal_contas_bancarias_global_insert" on public.contas_bancarias for insert to authenticated with check (is_gestor_global());
create policy "portal_contas_bancarias_global_update" on public.contas_bancarias for update to authenticated using (is_gestor_global()) with check (is_gestor_global());
create policy "portal_contas_bancarias_global_delete" on public.contas_bancarias for delete to authenticated using (is_gestor_global());

drop policy if exists "portal_contas_pagar_write_gestor" on public.contas_pagar;
create policy "portal_contas_pagar_insert_gestor" on public.contas_pagar for insert to authenticated with check (is_gestor_for_polo(polo_id));
create policy "portal_contas_pagar_update_gestor" on public.contas_pagar for update to authenticated using (is_gestor_for_polo(polo_id)) with check (is_gestor_for_polo(polo_id));
create policy "portal_contas_pagar_delete_gestor" on public.contas_pagar for delete to authenticated using (is_gestor_for_polo(polo_id));

drop policy if exists "portal_contas_receber_write_gestor" on public.contas_receber;
create policy "portal_contas_receber_insert_gestor" on public.contas_receber for insert to authenticated with check (is_gestor_for_polo(polo_id));
create policy "portal_contas_receber_update_gestor" on public.contas_receber for update to authenticated using (is_gestor_for_polo(polo_id)) with check (is_gestor_for_polo(polo_id));
create policy "portal_contas_receber_delete_gestor" on public.contas_receber for delete to authenticated using (is_gestor_for_polo(polo_id));

drop policy if exists "portal_documentos_templates_global_write" on public.documentos_templates;
create policy "portal_documentos_templates_global_insert" on public.documentos_templates for insert to authenticated with check (is_gestor_global());
create policy "portal_documentos_templates_global_update" on public.documentos_templates for update to authenticated using (is_gestor_global()) with check (is_gestor_global());
create policy "portal_documentos_templates_global_delete" on public.documentos_templates for delete to authenticated using (is_gestor_global());

drop policy if exists "portal_documentos_validacao_write_gestor" on public.documentos_validacao;
create policy "portal_documentos_validacao_insert_gestor" on public.documentos_validacao for insert to authenticated with check (is_gestor_for_polo(polo_id));
create policy "portal_documentos_validacao_update_gestor" on public.documentos_validacao for update to authenticated using (is_gestor_for_polo(polo_id)) with check (is_gestor_for_polo(polo_id));
create policy "portal_documentos_validacao_delete_gestor" on public.documentos_validacao for delete to authenticated using (is_gestor_for_polo(polo_id));

drop policy if exists "portal_documentos_validacao_politicas_write" on public.documentos_validacao_politicas;
create policy "portal_documentos_validacao_politicas_insert" on public.documentos_validacao_politicas for insert to authenticated with check (is_gestor_global());
create policy "portal_documentos_validacao_politicas_update" on public.documentos_validacao_politicas for update to authenticated using (is_gestor_global()) with check (is_gestor_global());
create policy "portal_documentos_validacao_politicas_delete" on public.documentos_validacao_politicas for delete to authenticated using (is_gestor_global());

drop policy if exists "portal_empresas_global_write" on public.empresas;
create policy "portal_empresas_global_insert" on public.empresas for insert to authenticated with check (is_gestor_global());
create policy "portal_empresas_global_update" on public.empresas for update to authenticated using (is_gestor_global()) with check (is_gestor_global());
create policy "portal_empresas_global_delete" on public.empresas for delete to authenticated using (is_gestor_global());

drop policy if exists "portal_fechamentos_academicos_write" on public.fechamentos_academicos;
create policy "portal_fechamentos_academicos_insert" on public.fechamentos_academicos for insert to authenticated with check (can_write_turma(turma_id));
create policy "portal_fechamentos_academicos_update" on public.fechamentos_academicos for update to authenticated using (can_write_turma(turma_id)) with check (can_write_turma(turma_id));
create policy "portal_fechamentos_academicos_delete" on public.fechamentos_academicos for delete to authenticated using (can_write_turma(turma_id));

drop policy if exists "portal_matricula_aproveitamentos_write" on public.matricula_aproveitamentos;
create policy "portal_matricula_aproveitamentos_insert" on public.matricula_aproveitamentos for insert to authenticated with check (exists (select 1 from public.matriculas m where m.id = matricula_aproveitamentos.matricula_id and can_write_turma(m.turma_id)));
create policy "portal_matricula_aproveitamentos_update" on public.matricula_aproveitamentos for update to authenticated using (exists (select 1 from public.matriculas m where m.id = matricula_aproveitamentos.matricula_id and can_write_turma(m.turma_id))) with check (exists (select 1 from public.matriculas m where m.id = matricula_aproveitamentos.matricula_id and can_write_turma(m.turma_id)));
create policy "portal_matricula_aproveitamentos_delete" on public.matricula_aproveitamentos for delete to authenticated using (exists (select 1 from public.matriculas m where m.id = matricula_aproveitamentos.matricula_id and can_write_turma(m.turma_id)));

drop policy if exists "portal_matricula_movimentacoes_write" on public.matricula_movimentacoes;
create policy "portal_matricula_movimentacoes_insert" on public.matricula_movimentacoes for insert to authenticated with check (can_write_turma(turma_origem_id) or can_write_turma(turma_destino_id));
create policy "portal_matricula_movimentacoes_update" on public.matricula_movimentacoes for update to authenticated using (can_write_turma(turma_origem_id) or can_write_turma(turma_destino_id)) with check (can_write_turma(turma_origem_id) or can_write_turma(turma_destino_id));
create policy "portal_matricula_movimentacoes_delete" on public.matricula_movimentacoes for delete to authenticated using (can_write_turma(turma_origem_id) or can_write_turma(turma_destino_id));

drop policy if exists "portal_mensageria_config_global_write" on public.mensageria_config;
create policy "portal_mensageria_config_global_insert" on public.mensageria_config for insert to authenticated with check (is_gestor_global());
create policy "portal_mensageria_config_global_update" on public.mensageria_config for update to authenticated using (is_gestor_global()) with check (is_gestor_global());
create policy "portal_mensageria_config_global_delete" on public.mensageria_config for delete to authenticated using (is_gestor_global());

drop policy if exists "portal_periodos_letivos_write" on public.periodos_letivos;
create policy "portal_periodos_letivos_insert" on public.periodos_letivos for insert to authenticated with check (can_write_turma(turma_id));
create policy "portal_periodos_letivos_update" on public.periodos_letivos for update to authenticated using (can_write_turma(turma_id)) with check (can_write_turma(turma_id));
create policy "portal_periodos_letivos_delete" on public.periodos_letivos for delete to authenticated using (can_write_turma(turma_id));

drop policy if exists "portal_regras_cobranca_global_write" on public.regras_cobranca;
create policy "portal_regras_cobranca_global_insert" on public.regras_cobranca for insert to authenticated with check (is_gestor_global());
create policy "portal_regras_cobranca_global_update" on public.regras_cobranca for update to authenticated using (is_gestor_global()) with check (is_gestor_global());
create policy "portal_regras_cobranca_global_delete" on public.regras_cobranca for delete to authenticated using (is_gestor_global());

drop policy if exists "portal_secretaria_config_global_write" on public.secretaria_config;
create policy "portal_secretaria_config_global_insert" on public.secretaria_config for insert to authenticated with check (is_gestor_global());
create policy "portal_secretaria_config_global_update" on public.secretaria_config for update to authenticated using (is_gestor_global()) with check (is_gestor_global());
create policy "portal_secretaria_config_global_delete" on public.secretaria_config for delete to authenticated using (is_gestor_global());

drop policy if exists "portal_taxas_pagamento_global_write" on public.taxas_pagamento;
create policy "portal_taxas_pagamento_global_insert" on public.taxas_pagamento for insert to authenticated with check (is_gestor_global());
create policy "portal_taxas_pagamento_global_update" on public.taxas_pagamento for update to authenticated using (is_gestor_global()) with check (is_gestor_global());
create policy "portal_taxas_pagamento_global_delete" on public.taxas_pagamento for delete to authenticated using (is_gestor_global());

drop policy if exists "portal_templates_mensagens_global_write" on public.templates_mensagens;
create policy "portal_templates_mensagens_global_insert" on public.templates_mensagens for insert to authenticated with check (is_gestor_global());
create policy "portal_templates_mensagens_global_update" on public.templates_mensagens for update to authenticated using (is_gestor_global()) with check (is_gestor_global());
create policy "portal_templates_mensagens_global_delete" on public.templates_mensagens for delete to authenticated using (is_gestor_global());

drop policy if exists "portal_transferencias_academicas_write" on public.transferencias_academicas;
create policy "portal_transferencias_academicas_insert" on public.transferencias_academicas for insert to authenticated with check (can_write_turma(turma_origem_id) or can_write_turma(turma_destino_id));
create policy "portal_transferencias_academicas_update" on public.transferencias_academicas for update to authenticated using (can_write_turma(turma_origem_id) or can_write_turma(turma_destino_id)) with check (can_write_turma(turma_origem_id) or can_write_turma(turma_destino_id));
create policy "portal_transferencias_academicas_delete" on public.transferencias_academicas for delete to authenticated using (can_write_turma(turma_origem_id) or can_write_turma(turma_destino_id));

drop policy if exists "portal_usuarios_sistema_write_global" on public.usuarios_sistema;
create policy "portal_usuarios_sistema_insert_global" on public.usuarios_sistema for insert to authenticated with check (is_gestor_global());
create policy "portal_usuarios_sistema_update_global" on public.usuarios_sistema for update to authenticated using (is_gestor_global()) with check (is_gestor_global());
create policy "portal_usuarios_sistema_delete_global" on public.usuarios_sistema for delete to authenticated using (is_gestor_global());
