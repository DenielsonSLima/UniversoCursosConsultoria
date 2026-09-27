# Hotfix de Convênios e datas brasileiras

Data: 2026-09-27
Versão: 4.8.113
Estado: publicado em produção

## Objetivo

Restaurar o acesso de usuários com escopo financeiro completo ao novo submódulo Convênios, corrigir o modal para a viewport, remover o aviso operacional solicitado e padronizar datas visíveis no formato brasileiro.

## Manifesto explícito

Total: 24 arquivos.

- `modules/gestor/financeiro/convenios/ConveniosTab.tsx`
- `modules/gestor/financeiro/convenios/components/ConvenioModalShell.tsx`
- `modules/gestor/financeiro/convenios/components/ConvenioFormModal.tsx`
- `modules/gestor/financeiro/convenios/convenios.presentation.ts`
- `modules/gestor/financeiro/convenios/convenios.mapper.test.ts`
- `modules/gestor/financeiro/convenios/convenios-ui.contract.test.ts`
- `supabase/migrations/20260927030900_convenios_financeiros_full_access_backfill.sql`
- `supabase/tests/convenios_financeiros.contract.test.ts`
- `modules/gestor/cadastros/modelos-documentos/carteirinha/carteirinha-date-formatters.ts`
- `modules/gestor/cadastros/modelos-documentos/carteirinha/carteirinha-date-formatters.test.ts`
- `modules/gestor/secretaria/carteirinhas/SecretariaCarteirinhasPage.tsx`
- `modules/aluno/secretaria/SecretariaPage.tsx`
- `modules/gestor/secretaria/historico-emissoes/preview-utils.ts`
- `modules/gestor/secretaria/historico-emissoes/components/EmissionDocumentPages.tsx`
- `modules/gestor/secretaria/shared/secretaria-documentos.service.ts`
- `modules/gestor/relatorios/components/RelatorioFinanceiroTurmaMensal.tsx`
- `modules/gestor/relatorios/components/relatorios.date-presentation.ts`
- `modules/gestor/relatorios/relatorios.datas-brasileiras.contract.test.ts`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/alteracoes/2026-09-27-hotfix-convenios-datas-brasileiras.md`

## Alterações

- O backfill idempotente acrescenta Convênios somente às fontes efetivas que já possuíam as oito abas financeiras anteriores; perfis restritos permanecem inalterados.
- O aviso “Polo responsável...” foi removido integralmente da tela.
- Modais de Convênios são portados para o `document.body`, ocupam a viewport e preservam scroll lock, foco, Escape e navegação por Tab.
- Competências de Convênios e do relatório financeiro usam `MM/AAAA` na interface e continuam enviando `AAAA-MM` ou `AAAA-MM-01` ao backend.
- Carteirinhas apresentam nascimento e validade em `DD/MM/AAAA`, com timestamps resolvidos em `America/Maceio`, sem alterar o snapshot, o modelo configurado ou o compositor vetorial.
- A competência inicial do relatório respeita o mês civil de Maceió e estados inválidos ficam identificados, sem impressão divergente.

## Banco de produção

- Migration `convenios_financeiros_full_access_backfill` aplicada via MCP Supabase.
- Ledger remoto confirmado na versão `20260927123831`.
- Smoke autenticado do usuário real confirmou `gestor_has_effective_financeiro_tab('convenios') = true` e leitura da RPC de meses.

## Validação

- Convênios: 22/22 testes.
- Controle de acesso: 31/31 testes.
- Formatadores de Carteirinha e Relatórios: 5/5 testes.
- Contrato do PDF histórico: 19/19 testes.
- TypeScript, ESLint focado e build de produção: aprovados.
- Code review independente: Critical 0, Important 0.
- Todos os arquivos manuais do manifesto permanecem com até 500 linhas.
- Smoke visual autenticado realizado após o deploy para confirmar modal e apresentação pública.
