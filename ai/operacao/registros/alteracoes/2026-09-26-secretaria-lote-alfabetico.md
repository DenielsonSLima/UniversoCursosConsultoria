# Secretaria: Pasta e Ficha em lote alfabético
Estado: backend validado; publicação do frontend 4.8.96 em preparação.
Classificação: mudança crítica de emissão e publicação, restrita aos dois documentos no modo em lote.
Produção solicitada explicitamente pelo usuário nesta conversa.

## Etapas e aceite
1. Diagnóstico e reunião: coordenador reproduziu o fluxo e revisor independente conferiu autorização, ordenação, idempotência e snapshots.
2. Correção: seleção ativa e ordenação pt-BR canônicas na nova RPC; resposta do frontend realinhada por matrícula.
3. Validação: ambos os lotes alfabéticos, matrícula TRANCADO excluída, código e snapshot associados ao aluno correto.
4. Publicação: um commit do manifesto em branch própria, Preview e produção via MCP GitHub.

## Reprodução e contrato
A Ficha da turma T-35 mostrava 16 alunos ativos, mas gerou 45 documentos em ordem de UUID. Agregado confirmado: 16 ATIVO, 10 TRANCADO, 10 DESISTENTE, 5 CANCELADO e 4 TRANSFERIDO.
Pasta já aplicava whitelist ativa; a Ficha passa a adotar ATIVO/PENDENTE/EM_ANDAMENTO. A RPC confere todos os IDs e autorização antes da exclusão, bloqueia alteração concorrente de situação e ordena pelo nome congelado efetivamente exibido no PDF, com UUID como desempate.
Modos individual e personalizado mantêm o contrato existente. Compositor, modelos, cabeçalho, marca e snapshots não foram alterados. Catálogo e snapshot foram extraídos do serviço para manter cada arquivo manual abaixo de 500 linhas.

## Validação
- 6 testes comportamentais executam serviço e adapter reais com transporte de fixture: ambos os documentos, trancamento concorrente, lote vazio, personalizado e identidade inválida.
- 4 contratos Pasta/campos cadastrais, 11 contratos de idempotência e 19 contratos do PDF aprovados.
- SQL transacional com ROLLBACK aprovado no projeto correto: ordenação com acentos, matrículas inativas, autorização, entradas inválidas, ambos os documentos e replay sem duplicação.
- Build e lint focado aprovados; PDFs nativos extraídos e páginas de Ficha/Pasta renderizadas.
- Migration aplicada via MCP: ledger 20260926171724_secretaria_active_alphabetical_registration_batch. Fonte preservada.
- Smoke pós-publicação: pendente da versão 4.8.96; esperado T-35 com 16 documentos em ordem alfabética.
- Alterações paralelas de Outros Créditos e seu lote ativo preservados. Versão/changelog de publicação são preparados a partir do main remoto, sem transportar a entrada local 4.8.95 ainda não publicada.

## Manifesto explícito
Total: 14 arquivos.

- `modules/gestor/secretaria/shared/secretaria-documentos.service.ts`
- `modules/gestor/secretaria/shared/secretaria-documentos.catalogo.ts`
- `modules/gestor/secretaria/shared/secretaria-registration-snapshot.ts`
- `modules/shared/document-validation/document-validation.service.ts`
- `modules/shared/document-validation/document-validation.types.ts`
- `modules/gestor/secretaria/pasta-identificacao/pasta-identificacao-batch.contract.test.ts`
- `modules/gestor/secretaria/shared/student-registration-fields.contract.test.ts`
- `modules/gestor/secretaria/shared/registration-batch.behavior.test.mjs`
- `supabase/migrations/20260926171724_secretaria_active_alphabetical_registration_batch.sql`
- `supabase/tests/secretaria_active_alphabetical_registration_batch.rollback.sql`
- `ai/operacao/registros/alteracoes/2026-09-26-secretaria-lote-alfabetico.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
