# Revisão cruzada das transferências — 25/09/2026

Estado: VALIDADO — backend aplicado; publicação web em andamento.

## Pedido e base

Usuário pediu nova revisão por etapas com três agentes e autorizou ajustes. Base publicada: 4.8.84, PR176, main `ff8b9dafcdfbdb0060b5cb0fe62dce1fad05c5ba`. A revisão troca os responsáveis em relação à implementação anterior. Não executar emissão, baixa, transferência ou cancelamento bancário real para teste.

## Etapas

1. Entrada acadêmica, permissões, aproveitamentos e plano: `eligibilidade_ciclos`.
2. Saída/interna, resposta incerta e histórico: `modal_ciclos`.
3. Continuidade, retomada bancária e contratos Edge: `auditoria_publicacao`.
4. Coordenador: proteção transacional, integração, revisão cruzada, documentação e publicação autorizada.

## Aceite

- Resposta perdida mantém a mesma operação até conciliação; rejeição posterior não prova rollback inicial.
- Histórico liga o cancelamento à transferência que o originou.
- Transferido não oferece emissão bloqueada nem permite cancelamento para reemissão pelo worker; consulta/reconciliação permanecem possíveis.
- Interface respeita permissões canônicas e limite de itens consistente com o emissor.
- Recebíveis, identidades bancárias, pagamentos, títulos Proesc e estados existentes permanecem preservados.
- Migrations aplicadas são imutáveis; qualquer ajuste SQL será nova migration.

## Manifesto explícito

- `.github/workflows/quality-gates.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-25-revisao-transferencias-tecnicas.md`
- `docs/decisions/transferencias-tecnicas.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/gestao/tecnicos/detalhes/TurmaTecnicoDetalhes.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/TurmaAcademico.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/TurmaAlunos.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/external-transfer-access.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/external-transfer-access.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/alunos/MovimentacaoAlunoModal.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunosTable.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualStatus.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-cycle-transfer-state.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-ui.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/hooks/transfer-financial-attempt.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/hooks/transfer-financial-attempt.ts`
- `modules/gestor/gestao/tecnicos/detalhes/hooks/useTransferFinancialReview.ts`
- `supabase/functions/technical-manual-cycle-recovery-worker/contract.test.ts`
- `supabase/functions/technical-manual-cycle-recovery-worker/contract.ts`
- `supabase/functions/technical-manual-cycle-recovery-worker/review-recovery.ts`
- `supabase/functions/technical-manual-cycle-recovery-worker/transfer-recovery.test.ts`
- `supabase/migrations/20260925091105_validate_transfer_reissue_fence_rollback_20260925.sql`
- `supabase/migrations/20260925091635_validate_transfer_review_final_rollback_20260925.sql`
- `supabase/migrations/20260925093000_scope_transfer_financial_history_to_movement.sql`
- `supabase/migrations/20260925093010_fence_technical_reissue_academic_status.sql`
- `supabase/migrations/20260925093020_guard_academic_exit_during_bank_replacement.sql`
- `supabase/tests/transfer_history_movement.transaction.sql`
- `supabase/tests/transfer_reissue_academic_fence.transaction.sql`

Total: 31 arquivos.

## Evidências iniciais

- 6.837 recebíveis, nominal R$ 1.876.839,27; hash `4189ccd6e56e96845ce0fe200f67d49f`.
- 454 estados em 11 turmas; hash `9a0ebb9a2cb54d6c61255df0a05984d5`.
- Zero planos de entrada e zero operações reais de transferência nos novos registros.
- Reprodução de resposta incerta seguida de 42501 perde chave de operação; histórico associa outbox de outra movimentação; retomada API_REVIEW não verificava situação acadêmica antes de cancelar para reemitir.
- Evidências temporárias em `tmp/revisao-transferencias-2026-09-25/`; não pertencem à publicação.

## Correções e revisão final

- Entrada: capacidade financeira derivada das permissões existentes; perfil acadêmico sem Financeiro/Receber não abre um fluxo impossível.
- Saída: tentativa isolada preserva chave e payload após resposta perdida, mesmo se o replay receber rejeição SQL. Rejeição da primeira tentativa permite revisar; falha visual após confirmação não recria operação. Catálogo indisponível não impede repetir a operação congelada.
- Histórico: outbox limitado ao movimento da própria transferência, incluindo matrícula, tipo e data; uma segunda saída não reescreve a situação bancária da primeira.
- Continuidade: origem transferida mantém contadores/consultas, mas não oferece retomada que a autorização bancária recusaria. Worker aceita o mesmo limite de 61 itens do emissor; regra da turma continua limitando a quantidade efetiva.
- Banco: recuperação GET continua permitida; substituição exige autorização canônica antes do fence e imediatamente antes da intenção. SQL serializa pessoa→matrícula→Banese→run/recebível, revalida status, proteção e LOCAL. CANCEL_INTENT/CONFIRMED impede saída mesmo com lease expirado. RESET_COMPLETE exige novo título comprovado ou obrigação encerrada.
- Revisão cruzada: entrada revisada por saída; saída por entrada; UI/worker por saída; SQL coordenador revisado pelo auditor. Corrigidas a inversão de locks e a janela entre reset e nova emissão antes da aplicação.

## Validação concluída

- 89 testes focados: 58 Edge/emissor/worker, 27 entrada/estado/fechamento e 4 replay. TypeScript, build completo e lint de produto aprovados.
- Lint global inicial incluiu artefatos temporários de outros lotes; falhas restritas a tmp. Execução com tmp excluído passou; nenhuma configuração de lint alterada.
- Navegador real: entrada desktop/mobile com permissão/revogação; hook+modal saída em três cenários; Safari confirmou C1/C2 transferidos sem Retomar e ATIVO/PENDENTE com ação funcional. Serviços sintéticos, sem I/O financeiro.
- SQL aplicado somente em transação revertida antes da aplicação final: candidato real e trigger em pg_temp; seis estados acadêmicos, proteção/LOCAL/NULL, intenção expirada, reset pendente e obrigação encerrada; histórico com duas saídas e um job. Todas as asserções passaram.
- Teto 500, contrato operacional e RAG aprovados: 13 fontes / 80 trechos. Sem alteração de AGENTS, skills ou regras de governança.

## Aplicação remota

| Fonte local | Versão remota |
|---|---|
| 20260925093000 | 20260925091914 |
| 20260925093010 | 20260925091917 |
| 20260925093020 | 20260925091921 |

Worker technical-manual-cycle-recovery-worker v7 ativo. Releitura confirmou igualdade integral dos 72 arquivos do bundle; somente contract.ts e review-recovery.ts substituídos. Emissor, autenticação do worker e dependências remotas preservados.

Marcadores no ledger 20260925091105 e 20260925091635 registram verificações com ROLLBACK; arquivos no-op correspondentes não recriam fixtures. Migrations previamente aplicadas não foram editadas.

## Limites e isolamento

Não houve transferência, boleto, baixa ou cancelamento real para teste. Smoke foi local com componentes reais; não houve sessão autenticada mutante em produção. Planos parciais com 1–2 títulos usam boleto individual/unificado disponível, pois o carnê existente exige 3–30 títulos; compositor preservado.

Manifesto: 31 arquivos. Changelog e registro de manifestos publicados a partir da base remota mais este lote, preservando diferenças locais paralelas de Caixa e outros registros operacionais. Publicação web 4.8.85 pendente de CI/Preview e conferência do domínio.

Após aplicação, recebíveis e 454 estados mantiveram os hashes iniciais; planos e operações novas continuam zerados.
