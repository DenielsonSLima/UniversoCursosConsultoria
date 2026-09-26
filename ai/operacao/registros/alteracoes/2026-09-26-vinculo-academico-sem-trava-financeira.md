# Vínculo acadêmico independente do financeiro

Estado: BACKEND APLICADO — publicação da interface 4.8.99 em preparação.

Autorização explícita do usuário em 26/09/2026: “pode aplicar autorizado”.

## Objetivo e aceite

Pedido de 26/09/2026: adicionar aluno regular a turma técnica iniciada deve ativar o vínculo e liberar carteirinha, ficha e documentos de matrícula sem aguardar financeiro ou checklist. Esta instrução substitui, para este fluxo técnico, a dependência anterior descrita na política financeira. Nenhum modelo ou compositor PDF é alterado.

- Novo vínculo regular em EM_ANDAMENTO retorna ATIVO, com financeiro ainda pendente.
- Vínculo anterior ao início é ativado quando a turma passa a EM_ANDAMENTO.
- Reconciliação auditada dos vínculos REGULAR/PENDENTE ou AGUARDANDO_CONFIRMACAO nas turmas técnicas em andamento.
- Implantação, saídas acadêmicas, conclusão, EAD e critérios específicos de estágio/IRPF permanecem fora da reconciliação.
- Autorização por turma, autorização de transição e idempotência do ingresso preservadas.
- Títulos, valores, quitações e configuração financeira existente não são alterados.

## Diagnóstico

MCP Supabase confirmou turma iniciada, documentação concluída e matrícula pendente por pagamento não confirmado no caso apresentado. Consulta agregada encontrou 32 vínculos regulares pendentes em turmas técnicas em andamento; todos possuem configuração financeira e nenhum é matrícula importada ou possui liberação de implantação. Dados pessoais e identificadores não integram este registro.

A carteirinha e sua validação pública exigem status ATIVO. Por isso a correção atualiza a matrícula canônica, sem aceitar pendências como se fossem vínculos ativos no emissor. Realtime operacional existente invalida o workspace de carteirinhas por polo ao receber mudança de matrícula.

## Manifesto explícito

- `supabase/migrations/20260926174000_decouple_technical_academic_activation.sql`
- `supabase/migrations/20260926174100_activate_technical_enrollment_on_admission.sql`
- `supabase/migrations/20260926174200_align_technical_academic_workflow.sql`
- `supabase/migrations/20260926174300_reconcile_started_technical_enrollments.sql`
- `supabase/tests/academic_activation.fixture.sql`
- `supabase/tests/academic_activation.behavior.test.mjs`
- `modules/gestor/parceiros/components/viewparceiros/aluno/documentos/MatriculaTecnicaAccessSection.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/documentos/MatriculaTecnicaAccessSection.behavior.test.mjs`
- `modules/gestor/gestao/tecnicos/detalhes/components/alunos/useTechnicalEnrollmentConfirmation.ts`
- `ai/operacao/registros/alteracoes/2026-09-26-vinculo-academico-sem-trava-financeira.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 13 arquivos.

## Validação

- 6 testes de execução SQL em Postgres isolado/PGlite, carregando as quatro migrations e a guarda real de transição. Cobrem ingresso, replay, autorização, tentativa de UPDATE direto, documentos em processamento, turma futura/iniciada, backfill sem JWT, preservação financeira e exclusões.
- Fixture reduz as dependências externas ao vínculo; não representa teste remoto integral.
- 5 testes comportamentais do componente real, incluindo ação permitida com pagamento/documentos pendentes, falta de permissão e turma não iniciada.
- 6 regressões existentes de emissão em lote de ficha/pasta aprovadas.
- Build completo aprovado em 26/09/2026. Executado antes da preparação dos metadados 4.8.99, sobre o controle de versão local 4.8.95; a publicação usa metadados remotos reconciliados em staging.
- Smoke no Safari da interface local com dados fictícios: clique de ativação apresenta ATIVO/MATRÍCULA ATIVA junto a DOCUMENTOS 2/9 e PAGAMENTO A CONCLUIR. Backend simulado apenas nesse harness; regra SQL testada separadamente.
- Duas correções decorrentes da revisão independente: contexto de serviço limitado ao backfill e responsável institucional resolvido por resolve_responsavel, sem confundir com UUID Auth.
- Os dois arquivos de implementação foram comparados à fonte atual do GitHub via MCP; diferenças restritas à comunicação desta regra.

Execução reproduzível do teste SQL, sem adicionar dependência ao aplicativo:

```sh
npm install --prefix /private/tmp/universo-academic-tests --no-audit --no-fund @electric-sql/pglite@0.5.8
ACADEMIC_TEST_PGLITE_PATH=/private/tmp/universo-academic-tests/node_modules/@electric-sql/pglite node --test supabase/tests/academic_activation.behavior.test.mjs
```

## Aplicação remota e conferência

- MCP Supabase aplicou as quatro migrations em 26/09/2026; fontes locais mantidas imutáveis. Ledger: 20260926174256 (decouple), 20260926174259 (admission), 20260926174301 (workflow) e 20260926174304 (reconcile).
- As definições remotas foram confrontadas antes da aplicação: nenhuma divergência nas funções substituídas.
- 32/32 vínculos ficaram ATIVO, cada qual com uma movimentação auditada; zero pendentes regulares elegíveis remanescentes.
- Hash integral da configuração financeira preservado nos 32 casos. Hash integral dos recebíveis idêntico em 31; o outro recebeu atualização concorrente de gateway_synced_at pelo monitor bancário entre 17:43:07 e 17:43:11, com os 12 títulos ainda PENDENTE. O SQL aplicado não escreve nos títulos.
- RPC real de carteirinhas confirmou disponibilidade do vínculo informado pelo usuário.
- Teste da RPC real de ingresso dentro de BEGIN/ROLLBACK confirmou ATIVO com checklist incompleto, zero cobranças criadas e replay do mesmo requestId. A fixture sintética foi revertida; contagem residual zero.
- Ficha do aluno visualizada no Safari autenticado em produção. Em Secretaria → Carteirinha, busca e seleção do aluno habilitaram a emissão; a prévia A4 abriu com foto, frente/verso e QR Code. Nenhuma impressão física foi disparada.

## Entrega da interface

Publicação pelo MCP GitHub usando somente este manifesto. Metadados preparados em staging sobre a main remota 4.8.97, reservando 4.8.99/revisão108 para preservar a entrega paralela PDV4.8.98. Reconsultar a main antes do commit e preservar seu changelog/registro de manifestos completos. Não enviar os metadados globais locais desatualizados. Nenhum compositor PDF foi modificado.

LOTE_ATIVO pertence a uma entrega paralela e não foi sobrescrito. Este registro separado preserva seu manifesto. Nenhuma fonte do corpus RAG foi alterada: registros históricos e registro de manifestos não são indexados.
