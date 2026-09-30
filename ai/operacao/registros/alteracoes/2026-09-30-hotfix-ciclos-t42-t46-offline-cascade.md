# Hotfix T42/T46: continuação local e cascata de vencimentos

Estado: VALIDADO PARA PUBLICAÇÃO — PRODUÇÃO AUTORIZADA

## Objetivo e aceite

- Tratar o primeiro ciclo importado e confirmado da T42 como histórico local durável: nenhuma consulta online ao Proesc participa da prévia ou da emissão do segundo ciclo.
- Manter Proesc apenas como origem histórica; as cobranças futuras são criadas localmente e os títulos bancários são emitidos exclusivamente pelo Banese.
- Exibir a escolha da matrícula do C1 antes da primeira prévia da T46.
- Em `REGISTRO_SEM_BOLETO`, aceitar vencimento retroativo controlado para a matrícula local, sem emitir boleto para ela.
- Ao editar a data dessa matrícula, posicionar a Mensalidade 1 no mês-calendário seguinte e recalcular as demais; preservar `BOLETO`, `OMITIR` e C2.

## Causa confirmada

- A T42 já possuía prova local durável de C1, mas a prévia ainda executava uma guarda de atualização Proesc de cinco minutos. Uma falha da consulta externa bloqueava indevidamente a geração local/Banese.
- Na T46, a produção só mostrava o modo da matrícula depois da prévia. A primeira requisição chegava com revisão nula, assumia `BOLETO` e rejeitava a data retroativa antes de o usuário conseguir selecionar `REGISTRO_SEM_BOLETO`.

## Manifesto explícito

- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualDialog.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualEnrollmentOptions.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/ciclo-manual-due-schedule.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/hooks/useCicloManualRevision.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-local-enrollment.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-ui.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/proesc-cycle-review.service.test.ts`
- `supabase/migrations/20260930204000_decouple_confirmed_imported_cycle_from_proesc_refresh.sql`
- `supabase/migrations/20260930204100_scope_durable_imported_c1_to_t42.sql`
- `supabase/tests/proesc_confirmed_c1_offline_continuation.transaction.sql`
- `supabase/tests/manual_cycle_first_preview_local_dates.transaction.sql`
- `docs/decisions/ciclos-tecnicos-cobrancas.md`
- `ai/operacao/registros/alteracoes/2026-09-30-hotfix-ciclos-t42-t46-offline-cascade.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/COMMITS_E_DEPLOYS.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-09-13-versoes-4-8-53-a-4-8-64.md`

Total: 20 arquivos.

## Contratos e segurança

- O bypass offline é restrito à turma `ENF-T42-INT-MAT`, matrícula ativa, escopo sem lote, política importada C1, evidência confirmada e íntegra, sem C2 externo, sem run local e sem cobertura externa.
- Evidência `UNKNOWN`, contrato completo, outros lotes e outras turmas continuam sujeitos à guarda Proesc anterior.
- A matrícula retroativa continua permitida somente como registro `LOCAL` sem boleto; boleto, rematrícula e mensalidade retroativos permanecem bloqueados.
- `OMITIR` não cria matrícula e ancora M1 na origem. C2 mantém rematrícula na origem e M1 no mês seguinte.
- A sequência usa meses-calendário e ajusta o último dia do mês; não soma dias fixos.

## Validação

- [PR #231](https://github.com/DenielsonSLima/UniversoCursosConsultoria/pull/231) com Preview Vercel aprovado.
- Reunião de três agentes: auditoria remota, revisão frontend e contrato backend/C2.
- T42 auditada integralmente: alvo elegível, 12/12 do C1 localmente pagos, zero C2 antes do smoke; grupos não confirmados permanecem bloqueados.
- T46 auditada: alvo elegível, zero runs e zero recebíveis; a tentativa rejeitada não gerou cobrança.
- Prévia remota somente leitura da T46 em 05/09/2026: 1 matrícula `LOCAL`, 12 títulos `BANESE`, M1 05/10/2026, M2 05/11/2026 e M12 05/09/2027.
- Testes frontend: 37 contratos do wizard/progresso e 1 isolamento Proesc aprovados; TypeScript e build de produção aprovados.
- Testes SQL transacionais `pg_temp` + `rollback` aprovados em produção para a continuação T42 e os três modos da T46, inclusive preservação do C2.
- Migrations remotas aplicadas: `20260930194246` e `20260930194344`; nenhuma migration aplicada foi reescrita.
- Todos os arquivos manuais deste manifesto permanecem com no máximo 500 linhas.
- Smoke autenticado final deve abrir apenas as prévias e cancelar antes da confirmação, seguido de conferência de zero criação nos alvos.
