# Secretaria — submódulos compactos

## Escopo e autorização

Correção visual dos submódulos internos da Secretaria solicitada em 07/11/2026, com três agentes e publicação em produção. O usuário autorizou Chrome expressamente nesta conversa, substituindo a preferência antiga pelo Safari somente nesta tarefa. Critérios: campos brancos compactos, títulos leves, abas com linha inferior e seletores pesquisáveis, preservando dados, ações, permissões e impressão.

Base remota 4.8.254: 73ea12b82dcd392761a19a84aa0eaf17002e553e. O candidato 4.8.257/revisão 266 foi montado em staging a partir dessa base; mudanças paralelas (inclusive candidato NFS-e 4.8.255) não integram o lote. Somente os caminhos abaixo serão publicados. Arquivos regeneráveis de QA permanecem em tmp.

## Manifesto explícito

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/alteracoes/2026-11-07-secretaria-submodulos-compactos.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/secretaria/SecretariaPage.tsx`
- `modules/gestor/secretaria/assinaturas/SecretariaAssinaturasAcervoFilters.tsx`
- `modules/gestor/secretaria/carnes-alunos/components/CarnesWorkspace.tsx`
- `modules/gestor/secretaria/carteirinhas-preceptor/components/CarteirinhasPreceptorEmissionWorkspace.tsx`
- `modules/gestor/secretaria/carteirinhas/SecretariaCarteirinhasControls.tsx`
- `modules/gestor/secretaria/certificados/SecretariaCertificadosPage.tsx`
- `modules/gestor/secretaria/consulta-financeira/components/BatchFinancePanel.tsx`
- `modules/gestor/secretaria/consulta-financeira/components/FinanceModeNavigation.tsx`
- `modules/gestor/secretaria/consulta-financeira/components/SettlementModal.tsx`
- `modules/gestor/secretaria/contratos-aluno/components/ContratosAlunoEmissionWorkspace.tsx`
- `modules/gestor/secretaria/contratos-aluno/components/contratos-aluno-workspace.utils.ts`
- `modules/gestor/secretaria/declaracao-matricula/SecretariaDeclaracaoSelection.tsx`
- `modules/gestor/secretaria/dependencias-academicas/components/DependenciasFilters.tsx`
- `modules/gestor/secretaria/dependencias-academicas/components/DependenciasFinancialRules.tsx`
- `modules/gestor/secretaria/documentos/SecretariaDocumentosPage.tsx`
- `modules/gestor/secretaria/historico-emissoes/components/EmissionsToolbar.tsx`
- `modules/gestor/secretaria/pasta-identificacao/pasta-identificacao-batch.contract.test.ts`
- `modules/gestor/secretaria/secretaria-workspace.css`
- `modules/gestor/secretaria/shared/SecretariaDocumentoBatchSelection.tsx`
- `modules/gestor/secretaria/shared/SecretariaDocumentoConfirmation.tsx`
- `modules/gestor/secretaria/shared/SecretariaDocumentoCustomSelection.tsx`
- `modules/gestor/secretaria/shared/SecretariaDocumentoEmissionPage.tsx`
- `modules/gestor/secretaria/shared/SecretariaDocumentoIndividualSelection.tsx`
- `modules/gestor/secretaria/shared/SecretariaDocumentoPrint.tsx`
- `modules/gestor/secretaria/shared/SecretariaDocumentoResult.tsx`
- `modules/gestor/secretaria/shared/official-document-viewer.contract.test.ts`
- `modules/gestor/secretaria/shared/secretaria-document-selection.behavior.test.tsx`
- `modules/gestor/secretaria/shared/secretaria-emission-workspace.model.ts`
- `modules/gestor/secretaria/shared/useSecretariaDocumentoEffects.ts`
- `modules/gestor/secretaria/shared/useSecretariaDocumentoWorkspace.ts`
- `modules/gestor/secretaria/solicitacoes/SecretariaSolicitacoesFilters.tsx`
- `modules/gestor/secretaria/solicitacoes/SecretariaSolicitacoesPage.tsx`
- `scripts/test-secretaria-ui.mjs`

- `modules/gestor/secretaria/certificados/ead-certificates.ui.test.mjs`
- `modules/gestor/secretaria/certificados/ead-curriculum.pdf.test.mjs`

Total: 41 arquivos.

## Implementação

Estilos de tela limitados por @scope com fronteiras explícitas para documentos, recursos em milímetros, portais e impressão. Cabeçalho interno independente do painel inicial já atualizado. Seletores usam InstitutionalSelect existente com IDs canônicos, busca com acentos, teclado, opções autorizadas e estados disabled/loading. Arquivo compartilhado repartido por responsabilidade com extração equivalente das rotinas e controle; cada arquivo manual do manifesto tem até 500 linhas.

## Validação

Revisão independente comparou 87 instruções do controlador e 9 funções de impressão com a base e preservou a ordem e o comportamento. Quatorze testes focados de seleção, troca de modalidade, bloqueio, lote e atualização do workspace aprovados. TypeScript completo do staging aprovado. Dois testes legados do visualizador apresentam falhas idênticas na base 4.8.254, em regex de código não alterado; o teste diretamente afetado pela extração passou.

Smoke local com componentes reais e dados sintéticos no Chrome: campos de 38 px, peso 500 nos rótulos, nenhum seletor nativo, documento de conferência preservado. Declaração em lote listou turmas, filtrou aguas → Águas e confirmou via teclado o ID turma-a. Na viewport 390 × 844, os campos mediram 44 px, sem excesso horizontal da página e com documento preservado. Build completo Node 24.22.1 passou: 4493 módulos em 9,34 s e 26 páginas sociais. Publicação autorizada via MCP segue a partir deste candidato, depois dos checks; o resultado remoto e smoke final serão reportados na entrega. A fixture não comprova escopo de dados nem autorização de backend.

## Integração com publicação paralela

Antes do commit, main avançou para 4.8.255 (2617628b2c92012b82aa2ab76148d7449dfcecb0), com ordenação alfabética das carteirinhas. Os nove arquivos dessa entrega foram preservados byte a byte, exceto os metadados de release que receberam a nova entrada e o manifesto incremental. A base final do commit é 4.8.255; não houve reaplicação de migration nem alteração do backend neste lote.

## Compatibilidade dos testes de interface

Duas fixtures de Certificados passaram a emitir e incorporar o CSS importado pelo seletor, com outfile virtual e escolha explícita de JS/CSS. Os quatro builds estáticos relevantes passaram. O gate remoto inicial passou nos outros dez checks; o EAD foi repetido após esta correção das fixtures, sem mudanças adicionais no produto.

Main avançou novamente durante o gate para 4.8.256/73e11e219334e24d62efdfd57432914718ade782, com NFS-e. Os 65 caminhos dessa entrega foram mantidos na base final; a Secretaria passou para 4.8.257, revisão 266. O RAG foi regenerado para o estado final integrado, pois houve mudança de fonte operacional após o fechamento inicial.
