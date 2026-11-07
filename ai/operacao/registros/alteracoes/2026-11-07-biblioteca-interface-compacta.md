# Biblioteca — interface compacta

## Escopo e base

Candidato 4.8.260/revisão 269 sobre main259/37eb81b3c97ec62b006ab31a933421df86ff5df1, tree dadd3a8e9743b7cc3e914d6f0f2c14c4ec9b7be4. A main avançou com Histórico de Emissões enquanto a PR #355 da Biblioteca já tinha sete checks verdes. O responsável forneceu os 16 arquivos exatos do delta259 via MCP; seus Git blob hashes foram conferidos 16/16 antes de incorporar. Nenhuma operação SQL, Storage ou remota foi executada por esta preparação. Entregas 255/256/257/258 e Histórico259 são preservadas; Comunicação continua adiada.

## Manifesto explícito

- `.github/workflows/biblioteca-ui-regressions.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/alteracoes/2026-11-07-biblioteca-interface-compacta.md`
- `docs/planos/padronizacao-visual-etapas-2026-11-07.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/biblioteca/BibliotecaPage.tsx`
- `modules/gestor/biblioteca/biblioteca-workspace.css`
- `modules/gestor/biblioteca/components/DocumentPermissionsModal.tsx`
- `modules/gestor/biblioteca/components/FileExplorer.tsx`
- `modules/gestor/biblioteca/components/LibraryHighlights.tsx`
- `modules/gestor/biblioteca/components/TeacherRepository.tsx`
- `modules/gestor/biblioteca/components/TeacherStorageConfig.tsx`
- `modules/gestor/biblioteca/components/UploadModal.tsx`
- `modules/gestor/biblioteca/components/UploadWizardPreviews.tsx`
- `modules/gestor/biblioteca/components/UploadWizardSteps.tsx`
- `modules/gestor/biblioteca/components/biblioteca-teachers.css`
- `modules/gestor/biblioteca/components/biblioteca-upload.css`
- `modules/gestor/biblioteca/components/file-explorer.behavior.test.mjs`
- `modules/gestor/biblioteca/components/file-explorer/FileExplorerDialogs.tsx`
- `modules/gestor/biblioteca/components/file-explorer/FileExplorerItems.tsx`
- `modules/gestor/biblioteca/components/file-explorer/FileExplorerToolbar.tsx`
- `modules/gestor/biblioteca/components/file-explorer/biblioteca-explorer.css`
- `modules/gestor/biblioteca/components/library-permissions.behavior.test.mjs`
- `modules/gestor/biblioteca/components/library-upload.behavior.test.mjs`
- `modules/gestor/biblioteca/components/uploadWizard.options.ts`
- `modules/gestor/biblioteca/components/uploadWizard.types.ts`
- `scripts/test-biblioteca-ui.mjs`

Total: 30 arquivos. Harnesses, logs, imagens e bundles em tmp não integram a publicação.

## Apresentação e contratos

Biblioteca e cinco abas, destaques, regras de liberação, explorador, repositórios docentes, configuração de armazenamento e publicação em quatro etapas seguem o padrão compacto. Seletores passam a listas pesquisáveis do sistema; IDs, públicos, limitações docentes e validação obrigatória mantêm os valores canônicos. Navegação, callbacks, confirmação de ação, regra de liberação e revisão antes de envio permanecem preservados.

Serviços, transporte, Storage, RLS e composição/worker da prévia documental não são alterados por este lote. As classes de tela não mudam a saída de documentos. A preparação e os testes não enviam, apagam, copiam, movem, publicam ou baixam arquivos reais.

## Validação e limites

- Runner fonte `scripts/test-biblioteca-ui.mjs`: 15/15 testes com Page, Explorer, Permissões e Upload reais, QueryClient e DOM. Rede, RPC, Storage, download, impressão e abertura externa bloqueados nos cenários afetados.
- Cobertura: cinco abas, payload de liberação/required, escopo docente, ações readOnly/público, mover/copiar/excluir/ZIP com IDs; quatro etapas, arquivo obrigatório/formato/tamanho, polo obrigatório, datas/duração e revisão sem envio.
- Workflow dedicado usa Node >=24.22.1, esbuild do projeto, jsdom 26.1 temporário, contents:read e checkout sem credenciais persistidas; sem segredos ou operações remotas nos testes. Runner 26 linhas/workflow 61, lint e YAML aprovados.
- Revisão AST de TeacherRepository e TeacherStorageConfig: idênticos à base258 após desconsiderar exclusivamente className e imports CSS; handlers e condições preservados. biblioteca.service.ts idêntico byte a byte à base258.
- Chrome local pelo responsável: Destaques/Gerenciador, combobox próprio com oito opções; Nova Pasta preenchida, quatro opções e Cancelar fecha sem escrita. Permissões a 390 px: rolagem, teclado Down/Down/Enter para POR_DATA, campo de data e rodapé acessíveis. Upload real recebeu arquivo sintético, percorreu quatro etapas até Revisão e não acionou Publicar. Não houve gravação/arquivo real. Revisão independente sem bloqueio.
- TeacherRepository/Storage têm paridade AST e navegação DOM nas cinco abas, sem mudança de handlers. A conferência visual específica de TeacherQuota não foi realizada: Chrome perdeu a janela (cgWindowNotFound) após Revisão do Upload. Não há afirmação de aceite visual desses painéis. Shell da prévia PDF não foi validado neste fechamento e permanece intocado, assim como renderizadores/worker/documentos. A cobertura representativa não equivale a validar todos os arquivos, perfis ou operações em produção.
- Rodada anterior sobre foto258, Node 24.22.1: TypeScript completo, lint de todas as fontes do manifesto, runner 15/15 e versão 259/revisão 268 aprovados. Build de 4542 módulos em 12,33 s, 26 páginas sociais. Gate de linhas: 3950 manuais/161 exceções, máximo manual 468 neste manifesto. Nova base main259: TypeScript, build (4544 módulos/13,72 s/26 páginas), versão260/revisão269 e gate de linhas (3959 manuais/161 exceções) aprovados. As 23 fontes/CI da Biblioteca são byte idênticas; os 15 testes anteriores e lint são reaproveitados, sem novas execuções visuais. Índice RAG desta mudança de base gerado uma vez: 15 fontes/80 trechos; contrato operacional aprovado.

## Publicação

Somente o manifesto explícito pode ser publicado pelo responsável via MCP. Nenhuma sincronização do workspace, operação remota ou alteração da interface fora destas frentes foi executada nesta preparação.
