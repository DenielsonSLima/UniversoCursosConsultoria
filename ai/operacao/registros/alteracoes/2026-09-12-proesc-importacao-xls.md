# Importação Proesc com cadastros dos XLS — 4.8.48

Estado: dados aplicados; fechamento local e publicação em validação pelo coordenador.

## Resultado aplicado

- 385 pessoas cadastradas por CPF canônico: 382 novos perfis e 3 reutilizados sem sobrescrita. Dois CPFs confirmados pelo usuário receberam proveniência própria; um caso sem CPF permanece pendente.
- Quatro turmas INTEGRAL de Japoatã criadas: T35 (01/06/2024), T38 (08/02/2025), T40 (12/04/2025) e T43 (07/02/2026). São 207 matrículas, respectivamente 45, 58, 43 e 61, com situação acadêmica documentada.
- Histórico financeiro aplicado: 2.940 cobranças e 1.854 cobranças com pagamento confirmado, total recebido de R$ 470.746,72 na Conta Proesc compartilhada. Totais por turma: T35 662/526; T38 993/663; T40 622/382; T43 663/283 (cobranças/pagas).
- 1.086 registros sem situação integral comprovada na API permanecem em conferência. Ausência de pagamento em um recorte não comprova cobrança aberta nem cancelamento; a interface identifica a revisão.
- T42 e Radiologia existentes foram preservadas. Não foram emitidos novos boletos na importação.
- Um email fonte coincidia com Auth sem identidade comprovada. O contato principal foi omitido apenas nesse cadastro, com valor original e referências XLS preservados na proveniência privada. Nenhuma credencial foi vinculada por coincidência de email.

## Escopo pendente e limites

- Aquidabã: T41 (08/04/2025) e T44 (03/03/2026); Porto da Folha: T37 (03/09/2024), T39 (08/04/2025) e T45 (03/03/2026). As cinco turmas SEM aguardam confirmação de turno, com 185 matrículas previstas; não foram inventados turnos.
- XLS fornece cadastro, turma e situação acadêmica; API fornece obrigações e fatos de pagamento. Não se inferem data final, ID nativo de matrícula, plano vendido ou cobertura de ciclos pelo número da turma/ano/quantidade de parcelas.
- Cobertura individual continua em revisão. Importar ou sincronizar pagamento confirmado não libera segundo ciclo; política e configuração reais continuam necessárias para futura emissão local.
- Canceladas e obrigações sem vínculo seguro permanecem no manifesto privado, sem associação por nome isolado ou preenchimento de CPF fictício.
- Payloads, CPFs, planilhas extraídas, confirmações pessoais e executores reais permanecem privados fora do repositório.

## Contratos e implantação

- RPCs internas autorizam antes do replay, preservam payload imutável e usam locks/claims privados ligados à transação. Alunos existentes são reutilizados; não são criados Auth, convites ou cobranças na etapa acadêmica.
- Matrícula de aluno CURSANDO mantém ATIVO como continuidade acadêmica comprovada, sem aprovar documentação. Trancamento, desistência, cancelamento e transferência pertencem à matrícula.
- Turmas legadas guardam espelhos financeiros neutros e condições em conferência; edição acadêmica não fabrica plano, publicação ou calendário. Geração permanece bloqueada até prova individual.
- Migrations 00–07, 30/40/45/50/60/65/70/75 e extensões 76/78 aplicadas por MCP; fontes aplicadas são imutáveis.
- Edge Proesc v6 publicado pelo coordenador, com paridade dos 11 arquivos conferida. A sincronização processa lotes maiores com concorrência limitada e avança somente o prefixo efetivamente concluído; itens fora de ordem podem repetir com idempotência.
- Quatro eventos de histórico registrados como IMPORTACAO/PARCIAL/PROESC_API, com replay aprovado e conferência residual preservada. A publicação 4.8.48 e o smoke autenticado ainda são verificados no fechamento; não declarar CI ou produção concluídos antes dessa confirmação.

## Validação

- Ensaio acadêmico/financeiro/cobertura com BEGIN e rollback aprovado antes da importação real: identidade, replay, status, turno pendente, guardas e preservação T42/Radiologia.
- Ensaio de cadastro isolado aprovado: CPF canônico, reuso imutável, origem documental e nenhuma criação de Auth, comunicação, matrícula ou cobrança inesperada.
- Auditoria real dos 385 cadastros: zero CPF inválido/duplicado/divergente, zero Auth indevidamente vinculado, zero convite/notification outbox/push provocado pela importação. Dois CPFs confirmados e email pendente preservados em proveniência.
- Auditoria financeira real aprovada: 2.940 vínculos e recebíveis únicos, uma conta Proesc, 1.854 pagamentos e R$ 470.746,72 recebidos, sem divergências nas guardas auditadas.
- Consulta automática habilitada para 2.940 novos vínculos em 31 blocos, somando 3.286 com a T42. Auditoria global: uma Conta Proesc, zero vínculos inelegíveis e proteção de ciclos mantida. Duas chamadas reais do worker v6 concluíram 60 consultas cada, sem falhas; nova consulta não exige tela aberta.
- Os 75 blocos de auditoria compararam integralmente principal, vencimento, identidade, linhas contábeis, data/valor de pagamento e recibos: nenhuma divergência. Recebimentos foram conferidos por mês de pagamento.
- Build completo 4.8.48 aprovado. Smoke funcional V4 com a identidade Auth real e páginas de 25 confirmou as quatro turmas e separação pago/conferência. O erro 53100 ocorreu no harness amplo que repetia páginas JSON na ordenação; a correção ficou no teste privado, sem alteração adicional do produto.
- Sete testes do worker aprovados; ensaio SQL do cursor por prefixo concluído aprovado pelo coordenador. Novo teste de escala protege falha intermediária e retomada idempotente.
- Interface: 10 testes focados aprovados, TypeScript e ESLint sem diagnósticos no escopo. Smoke sintético do componente real aprovado em Chromium desktop e mobile, sem overflow e com estados Proesc/Banese preservados. Smoke autenticado e validação integrada de fechamento continuam sob responsabilidade do coordenador.
- Os testes acadêmicos sintéticos exigem banco anterior à importação real e rollback externo; não devem ser executados agora sobre o lote aplicado. O teste individual usa o operador confirmado do escopo, sem representá-lo como usuário Auth.
- Controle de versão 4.8.48/revisão 57 e check:file-lines aprovados; manifesto de 40 arquivos, todos abaixo de 500 linhas. O registro de manifestos para publicação usa a base remota e026a0f mais este lote, preservando referências locais paralelas fora do commit.
- PR 141/4.8.47 é entrega anterior independente. Seu registro foi encerrado neste lote documental: Vercel/produção confirmados; GitHub Actions permaneceu na fila sem runner, sem alegação de CI aprovado.

## Manifesto explícito

- `supabase/migrations/20260912220000_proesc_academic_import_registry.sql`
- `supabase/migrations/20260912220001_proesc_bootstrap_authorization.sql`
- `supabase/migrations/20260912220002_proesc_stage_batch_and_students.sql`
- `supabase/migrations/20260912220003_proesc_create_confirmed_classes.sql`
- `supabase/migrations/20260912220004_proesc_import_source_enrollments.sql`
- `supabase/migrations/20260912220005_proesc_bootstrap_neutral_class_mirrors.sql`
- `supabase/migrations/20260912220006_proesc_student_source_provenance.sql`
- `supabase/migrations/20260912220007_proesc_preserve_neutral_academic_updates.sql`
- `supabase/migrations/20260912220030_proesc_financial_scope_contract.sql`
- `supabase/migrations/20260912220040_proesc_import_original_obligations.sql`
- `supabase/migrations/20260912220045_proesc_individual_cycle_evidence.sql`
- `supabase/migrations/20260912220050_proesc_scoped_financial_generation_guards.sql`
- `supabase/migrations/20260912220060_proesc_scoped_sync_and_links.sql`
- `supabase/migrations/20260912220065_proesc_verified_open_obligations.sql`
- `supabase/migrations/20260912220070_proesc_scoped_residual_evidence.sql`
- `supabase/migrations/20260912220075_proesc_finalize_enrollment_financial_review.sql`
- `supabase/migrations/20260912220076_proesc_linked_history_visibility.sql`
- `supabase/migrations/20260912220078_proesc_sync_completed_prefix.sql`
- `supabase/tests/proesc_students_only.transaction.sql`
- `supabase/tests/proesc_academic_bootstrap.transaction.sql`
- `supabase/tests/proesc_neutral_academic_updates.transaction.sql`
- `supabase/tests/proesc_individual_cycle_evidence.transaction.sql`
- `supabase/tests/proesc_xls_financial_import.transaction.sql`
- `supabase/tests/proesc_xls_financial_guards.readonly.sql`
- `supabase/tests/proesc_sync_prefix.transaction.sql`
- `supabase/functions/proesc-api/sync-worker.ts`
- `supabase/functions/proesc-api/sync-worker.scale.test.ts`
- `modules/gestor/financeiro/financeiro.proesc-evidence.test.ts`
- `modules/gestor/financeiro/financeiro.proesc-evidence.ts`
- `modules/gestor/financeiro/financeiro.receivables-page.service.ts`
- `modules/gestor/financeiro/financeiro.types.ts`
- `modules/gestor/financeiro/receber/components/modalidade-receber/ReceivableItemPresentation.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/receivable-proesc-review.test.ts`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/MEMORIA_CANONICA.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-12-proesc-importacao-xls.md`
- `ai/operacao/registros/alteracoes/2026-09-12-revisao-banese-proesc.md`

Total: 40 arquivos.
