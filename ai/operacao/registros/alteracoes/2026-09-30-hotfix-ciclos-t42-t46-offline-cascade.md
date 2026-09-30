# Hotfix T42/T46: continuação local e cascata de vencimentos

Estado: PUBLICADO EM PRODUÇÃO — SMOKE AUTENTICADO PENDENTE

## Objetivo e aceite

- Tratar o primeiro ciclo importado e confirmado da T42 como histórico local durável: nenhuma consulta online ao Proesc participa da prévia ou da emissão do segundo ciclo.
- Manter Proesc apenas como origem histórica; as cobranças futuras são criadas localmente e os títulos bancários são emitidos exclusivamente pelo Banese.
- Exibir a escolha da matrícula do C1 antes da primeira prévia da T46.
- Em `REGISTRO_SEM_BOLETO`, aceitar vencimento retroativo controlado para a matrícula local, sem emitir boleto para ela.
- Ao editar a data dessa matrícula, posicionar a Mensalidade 1 no mês-calendário seguinte e recalcular as demais; preservar `BOLETO`, `OMITIR` e C2.

## Causa confirmada

- A T42 já possuía prova local durável de C1, mas a prévia ainda executava uma guarda de atualização Proesc de cinco minutos. Uma falha da consulta externa bloqueava indevidamente a geração local/Banese.
- A geração T42 inseria o `run GENERATING` antes dos recebíveis; a própria inserção invalidava a prova durável e reativava a guarda Proesc dentro da mesma transação.
- Na T46, a produção só mostrava o modo da matrícula depois da prévia. A primeira requisição chegava com revisão nula, assumia `BOLETO` e rejeitava a data retroativa antes de o usuário conseguir selecionar `REGISTRO_SEM_BOLETO`.
- Mesmo com o seletor antecipado, a data sugerida ainda disparava uma prévia antes da digitação. A seleção local agora limpa a sugestão e aguarda a data explícita.

## Manifesto explícito

- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualDialog.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualEnrollmentOptions.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/ciclo-manual-due-schedule.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/hooks/useCicloManualRevision.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-local-enrollment.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-ui.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-state-recovery.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/proesc-cycle-review.service.test.ts`
- `supabase/migrations/20260930204000_decouple_confirmed_imported_cycle_from_proesc_refresh.sql`
- `supabase/migrations/20260930204100_scope_durable_imported_c1_to_t42.sql`
- `supabase/migrations/20260930210500_allow_current_t42_c2_generation_from_durable_c1.sql`
- `supabase/tests/proesc_confirmed_c1_offline_continuation.transaction.sql`
- `supabase/tests/proesc_t42_current_generation_guard.transaction.sql`
- `supabase/tests/manual_cycle_first_preview_local_dates.transaction.sql`
- `docs/decisions/ciclos-tecnicos-cobrancas.md`
- `ai/operacao/registros/alteracoes/2026-09-30-hotfix-ciclos-t42-t46-offline-cascade.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/COMMITS_E_DEPLOYS.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-09-13-versoes-4-8-53-a-4-8-64.md`

Total: 23 arquivos.

## Contratos e segurança

- O bypass offline é restrito à turma `ENF-T42-INT-MAT`, matrícula ativa, escopo sem lote, política importada C1, evidência confirmada e íntegra e sem C2 externo ou cobertura externa.
- Antes da emissão, a prova exige zero run. Dentro da emissão, admite somente o único C2 `GENERATING` criado pela transação corrente do banco (`xmin`), com `request_id`, sem conclusão e sem recebíveis; qualquer run concluído, antigo, estranho ou paralelo permanece bloqueado.
- A prova fica ancorada em `verified_observed_at` e `source_hash`; uma atualização concorrente do cache não apaga evidência já verificada.
- Evidência `UNKNOWN`, contrato completo, outros lotes e outras turmas continuam sujeitos ao preflight Proesc condicional anterior.
- A matrícula retroativa continua permitida somente como registro `LOCAL` sem boleto; boleto, rematrícula e mensalidade retroativos permanecem bloqueados.
- `OMITIR` não cria matrícula e ancora M1 na origem. C2 mantém rematrícula na origem e M1 no mês seguinte.
- A sequência usa meses-calendário e ajusta o último dia do mês; não soma dias fixos.

## Validação

- [PR #231](https://github.com/DenielsonSLima/UniversoCursosConsultoria/pull/231) incorporado por squash `f391897da706ee9a1a07b7e0b7e7d66b327fdaee`; head revisado `d5b531db6c0aeda8fa0dd14c6595e17ad70ad476`, CI de qualidade/versionamento e Preview Vercel aprovados.
- Produção Vercel `AWxwHVwvuGJW2PEJQph7jsR6RGxR` com sucesso; `universocc.com.br/gestor` entrega `/assets/main-81CHl2Du.js`, contendo exclusivamente a versão `4.8.140`.
- Reunião de três agentes: auditoria remota, revisão frontend e contrato backend/C2.
- T42 auditada integralmente no momento da correção: 15 matrículas elegíveis para C2, 5 já geradas, 4 protegidas por histórico, 9 ativas ainda sem evidência C1 confirmada e 2 trancadas; esses dois últimos grupos permanecem corretamente bloqueados.
- Alvo T42 validado: elegível, 12 recebíveis históricos, zero run C2 antes e depois dos testes; nenhuma cobrança foi criada.
- T46 auditada: alvo elegível, zero runs e zero recebíveis; a tentativa rejeitada não gerou cobrança.
- Prévia remota transacional da T46 em 05/09/2026: 1 matrícula `LOCAL`, 12 títulos `BANESE`, M1 05/10/2026, M2 05/11/2026 e M12 05/09/2027.
- Testes focados do wizard/cascata: 24 contratos aprovados; TypeScript aprovado. O serviço condicional Proesc passou em bundle Node isolado.
- Testes SQL transacionais com `rollback` aprovados em produção para o ponto pós-run/pré-recebível da T42 e os três modos da T46, inclusive preservação do C2.
- Migrations remotas aplicadas: `20260930194246`, `20260930194344` e `20260930201128`; nenhuma migration aplicada foi reescrita.
- Todos os arquivos manuais deste manifesto permanecem com no máximo 500 linhas.
- Smoke autenticado final pendente: Safari passou para `/sistema/login` com Turnstile após encerramento da sessão. Nenhum contorno foi realizado. Conferência pós-deploy manteve T42 alvo em zero runs/12 recebíveis e ambos os alvos T46 em zero runs/zero recebíveis.
- O check de linhas local encontrou 12 arquivos/manifestações ausentes preexistentes no workspace desatualizado; o mesmo gate passou no CI do head publicado. Nenhuma mudança paralela foi incluída para reparar essa divergência local.
