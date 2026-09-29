# Cadastro do aluno: entrega e órgão emissor

Estado: EM PUBLICAÇÃO — versão 4.8.128; migration aplicada e validada; smoke visual pendente.

## Objetivo e aceite

- Registrar entrega sem anexo por ✓ diretamente no checklist, com estado visível e correção acessível.
- Quando houver anexo, expor Visualizar e Excluir anexo; preservar confirmação e proteção de arquivos compartilhados.
- Novo aluno e edição usam seleção pesquisável de órgão emissor, sem persistir a busca livre.
- Catálogo controlado no banco impede novos valores inválidos; campo opcional e registros históricos não alterados continuam preservados.

## Coordenação

Três agentes solicitados pelo usuário: documentos, interface do órgão emissor e catálogo/validação no banco. Reunião técnica alinhou contrato, compatibilidade histórica e escopo; coordenador reproduziu tela e faz revisão integrada.
Lote anterior preservado em `2026-09-27-caixa-workspace-v2-integracao.md`, publicado na 4.8.124 com smoke visual final ainda registrado como pendente. Alterações paralelas encontradas nos arquivos não foram revertidas.

## Manifesto explícito

- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoDocumentos.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/useParceiroAlunoDocumentosWorkflow.ts`
- `modules/gestor/parceiros/components/viewparceiros/aluno/documentos/DocumentoChecklistCard.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/documentos/DocumentosChecklist.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/documentos/excluir-anexos-documento.ts`
- `modules/gestor/parceiros/components/viewparceiros/aluno/documentos/documento-entrega-anexos.test.mjs`
- `modules/gestor/parceiros/orgaos-emissores.service.ts`
- `modules/gestor/parceiros/components/formularioparceiros/aluno/OrgaoEmissorPicker.tsx`
- `modules/gestor/parceiros/components/formularioparceiros/aluno/ParceiroAlunoFormStepDocuments.tsx`
- `modules/gestor/parceiros/components/formularioparceiros/aluno/ParceiroAlunoForm.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoDetailsSections.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoDados.tsx`
- `supabase/migrations/20260929013437_create_student_identity_issuers.sql`
- `supabase/tests/student_identity_issuers.isolated.test.mjs`
- `modules/gestor/parceiros/utils/aluno-formatters.ts`
- `modules/gestor/parceiros/components/viewparceiros/aluno/parceiro-aluno-dados.utils.ts`
- `modules/gestor/parceiros/components/viewparceiros/aluno/orgao-emissor-roundtrip.test.mjs`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-28-aluno-entrega-orgao-emissor.md`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `supabase/tests/student_identity_issuers.rollback.sql`

Total: 23 arquivos.

## Contratos e risco

- RPC existente de recebimento sem anexo aceita motivo vazio e registra mensagem/auditoria padrão, confirmado por consulta MCP somente leitura.
- Exclusão arquiva a versão antes de solicitar exclusão dos arquivos; falha entre etapas pode deixar versão arquivada, e o cache é reconciliado. Arquivo compartilhado com outro item ativo é bloqueado antes do arquivamento.
- Catálogo tem SELECT autenticado, RLS por ativo e nenhum DML frontend; trigger SECURITY INVOKER com search_path vazio protege inserts, mudanças de órgão e conversão para Aluno.
- Não converte textos históricos em opções do catálogo. Seed institucional e fontes constam da migration.
- Produção autorizada explicitamente nesta conversa: "sim autorizado". Migration `20260929013437` aplicada via MCP no projeto Universo antes do frontend; fonte local renomeada para coincidir com o ledger, sem alteração do SQL aplicado.

## Validação

- Reprodução Safari autenticado na versão 4.8.127: texto arbitrário aceito no campo Órgão expedidor durante edição, descartado sem salvar; checklist sem ✓ direto confirmado.
- Validação final do coordenador: 12 testes aprovados (9 de documentos e 3 de ida e volta do órgão legado), além de 20 verificações PostgreSQL isoladas aprovadas.
- TypeScript completo sem erros após correções; lint final do coordenador aprovado em 13 arquivos TypeScript. Também passaram 15 testes existentes de mapeamento/validação.
- Índice RAG atualizado uma vez no fechamento: 14 fontes/80 trechos; artefato gerado não integra o manifesto.
- Smoke visual final pendente: conexão CUA falhou com `native pipe startup failed`; reconexão e reset terminaram em `failed to start Node runtime`. Nenhuma edição de aluno real foi salva e nenhum anexo real foi excluído.
- Harness temporário em tmp não integra o manifesto.
- `npm run check:file-lines` executado: bloqueado por 12 referências ausentes de lotes anteriores (financeiro/conveniados/migrations), fora deste manifesto. Não houve correção de dívida alheia; todos os 20 arquivos do manifesto atual passaram na contagem focada (máximo: 482 linhas).
- Revisão cruzada concluída: removida normalização implícita do órgão legado nos mapeadores; exclusão pelo Histórico não arquiva versão ativa. Ação direta reconsulta painel e exige a mesma versão explícita; falha parcial informa recuperação. Novas regressões executadas e aprovadas.

## Publicação autorizada

- Base remota: `374ba8f58219b5289b57e5a6a6e336c1714ea9c8` (4.8.127). Comparação de todos os arquivos existentes do manifesto contra a base confirmou somente alterações do pedido.
- Build completo de produção aprovado para 4.8.128 (revision 137); avisos existentes de tamanho de chunks e importação estática/dinâmica não impediram o build.
- Supabase: catálogo de 10 opções, trigger conectado a parceiros, RLS e grants mínimos confirmados remotamente. Contrato real da trigger executado em tabela temporária com papel authenticated e ROLLBACK: seleção canônica, rejeição de texto livre/alteração/conversão, vazio e legado aprovados. Nenhum cadastro real alterado.
- Nova tentativa de Safari falhou com `failed to start Node runtime: No such file or directory`. A validação visual autenticada permanece pendente; não é substituída pelo build.
- Entrega GitHub por manifesto atômico; preview e produção em acompanhamento.
