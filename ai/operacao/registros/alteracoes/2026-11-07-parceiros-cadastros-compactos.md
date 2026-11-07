# Parceiros — cadastros e seletores compactos

## Objetivo e aceite

Aplicar o padrão visual compacto aprovado aos cadastros de Aluno, Professor, Pessoa Física e Pessoa Jurídica, aos cartões e à área de Responsáveis. Preservar todos os campos, valores, validações, identidade canônica, escopo por polo, etapas, permissões, operações e quatro cartões por linha no desktop amplo. Os seletores do escopo usam painel próprio pesquisável, sem menu nativo.

Base técnica: Financeiro 4.8.251, commit `af4433151c1340df32757e2ddca463adde0d7126`. Entrega preparada como 4.8.252, revisão 261, em 07/11/2026; verificada localmente nos fluxos descritos abaixo, com aceite do refinamento móvel compartilhado nos limites descritos abaixo e publicação em produção solicitada pelo usuário.

## Manifesto explícito

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/alteracoes/2026-11-07-parceiros-cadastros-compactos.md`
- `docs/analises/parceiros-carregamento-2026-11-07.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/components/ConfirmModal.tsx`
- `modules/gestor/configuracoes/categorias/components/CategoriaForm.tsx`
- `modules/gestor/configuracoes/tipos-parceria/components/TipoParceriaForm.tsx`
- `modules/gestor/parceiros/components/ParceiroFormHost.tsx`
- `modules/gestor/parceiros/components/ParceiroSelectionModal.tsx`
- `modules/gestor/parceiros/components/ParceirosFilters.tsx`
- `modules/gestor/parceiros/components/ParceirosList.tsx`
- `modules/gestor/parceiros/components/cards/AlunoCard.tsx`
- `modules/gestor/parceiros/components/cards/partner-cards.css`
- `modules/gestor/parceiros/components/formularioparceiros/aluno/ParceiroAlunoForm.tsx`
- `modules/gestor/parceiros/components/formularioparceiros/aluno/parceiro-aluno-form.navigation.test.mjs`
- `modules/gestor/parceiros/components/formularioparceiros/aluno/ParceiroAlunoFormStepContact.tsx`
- `modules/gestor/parceiros/components/formularioparceiros/aluno/ParceiroAlunoFormStepDocuments.tsx`
- `modules/gestor/parceiros/components/formularioparceiros/aluno/ParceiroAlunoFormStepEducation.tsx`
- `modules/gestor/parceiros/components/formularioparceiros/aluno/ParceiroAlunoFormStepFamily.tsx`
- `modules/gestor/parceiros/components/formularioparceiros/aluno/ParceiroAlunoFormStepPersonal.tsx`
- `modules/gestor/parceiros/components/formularioparceiros/partner-registration-auxiliary.css`
- `modules/gestor/parceiros/components/formularioparceiros/partner-registration.css`
- `modules/gestor/parceiros/components/formularioparceiros/partner-select-change.ts`
- `modules/gestor/parceiros/components/formularioparceiros/pf/ParceiroPFForm.tsx`
- `modules/gestor/parceiros/components/formularioparceiros/pj/ParceiroPJFields.tsx`
- `modules/gestor/parceiros/components/formularioparceiros/pj/ParceiroPJForm.tsx`
- `modules/gestor/parceiros/components/formularioparceiros/pj/parceiro-pj-form.types.ts`
- `modules/gestor/parceiros/components/formularioparceiros/professor/ParceiroProfessorForm.tsx`
- `modules/gestor/parceiros/components/formularioparceiros/professor/ProfessorContactStep.tsx`
- `modules/gestor/parceiros/components/formularioparceiros/professor/ProfessorEducationStep.tsx`
- `modules/gestor/parceiros/components/formularioparceiros/professor/ProfessorPaymentStep.tsx`
- `modules/gestor/parceiros/components/formularioparceiros/professor/ProfessorPersonalStep.tsx`
- `modules/gestor/parceiros/components/partner-filters.css`
- `modules/gestor/parceiros/components/partner-selection.css`
- `modules/gestor/parceiros/responsaveis/ResponsaveisTab.tsx`
- `modules/gestor/parceiros/responsaveis/components/ResponsaveisList.tsx`
- `modules/gestor/parceiros/responsaveis/components/ResponsaveisToolbar.tsx`
- `modules/gestor/parceiros/responsaveis/components/ResponsavelDetailsPanel.tsx`
- `modules/gestor/parceiros/responsaveis/components/ResponsavelIdentitySection.tsx`
- `modules/gestor/parceiros/responsaveis/components/ResponsavelLinksSection.tsx`
- `modules/gestor/parceiros/responsaveis/responsaveis.css`
- `modules/shared/components/InstitutionalSelect.tsx`
- `modules/shared/components/institutional-select.css`
- `modules/shared/components/institutional-select.test.tsx`

Total: 47 arquivos.

## Escopo e fronteiras

- Formulários reais preservados, com cabeçalhos, etapas, seções, campos e rodapés compactos. PJ divide campos e tipos em arquivos próprios, mantendo queries, estado e handlers no controlador.
- InstitutionalSelect compartilhado representa opções autorizadas por valor canônico, com busca, teclado, foco, ARIA, obrigatório e bloqueio de fieldset. Campos de catálogo que admitem texto livre conservam EditableCombobox; a busca não substitui cadastro por texto livre.
- Cartões preservam nome completo, identidade, contato e informações acadêmicas; ícones ficam centrados e a grade mantém quatro colunas no desktop amplo. Responsáveis conserva criação, verificação, vínculo e acesso condicionados às capacidades existentes.
- Categorias e Tipos de Parceria recebem apenas compatibilidade visual dos formulários auxiliares abertos por Parceiros; não constitui início da próxima etapa de Configurações.
- Nenhum serviço de parceiros, query key, payload, RLS, migration ou cálculo financeiro foi alterado por este lote visual. Conteúdo e geradores PDF não entram na mudança.
- Análise de carregamento publicada em docs/analises/parceiros-carregamento-2026-11-07.md: lista e enriquecimento integrais, paginação local, filtro de polo presente e cache separado. Não foi aplicada paginação parcial que esconderia resultados; otimização de dados continua proposta própria, dependente de medição e contrato revisado.
- A skill e a especificação visual solicitadas expressamente possuem registro operacional separado: 2026-11-07-padrao-visual-compacto.md. Harnesses e fixtures em tmp são descartáveis e não integram a entrega.

## Validação disponível

O harness local usa GestorPortalShell, ParceirosPage e formulários reais, com 24 parceiros fictícios e leituras sintéticas. Sete entradas montadas em DOM: listagem de 20 cartões sobre 24 registros, Aluno, Professor, PF, PJ, seleção e Responsáveis; zero requests externos. Os casos isolados de Responsáveis usam componentes reais e callbacks bloqueados. Essa prova é de composição local, não de autorização de produção ou latência real.

Validações informadas pelas frentes: TypeScript completo e lint da união de 32 fontes TS/TSX aprovados; 9 testes do InstitutionalSelect; 18 contratos existentes de Professor, guarda de Aluno, filtros e seleção; 14 contratos da frente de cartões/Responsáveis, com possível sobreposição entre os grupos. Comparação AST preservou 134 controles e 41 handlers originais. PF real percorreu 3 etapas em DOM e conservou o payload sintético; Categorias/Tipos reais conservaram seletores, bloqueio busy e payloads sem I/O. A frente de cartões/Responsáveis montou 19 casos SSR e conferiu portal, ARIA e fechamento de ConfirmModal em DOM; CSS parseado com PostCSS.

Revisão final de estados bloqueados: o fundo branco de partner-registration.css e partner-registration-auxiliary.css ficou limitado a :not(:disabled), preservando o cinza do combobox desabilitado e do fieldset pendente. Seis casos de cascata CSS passaram, incluindo formulário, auxiliares e recorte de escopo; testes do seletor compartilhado 9/9 e suíte temporária estendida 13/13 confirmaram estados e interação. Nenhum controller, handler ou teste temporário foi acrescentado à entrega por essa correção.

A checagem de versão passou. Contagem direta da união explícita confirma os 50 manuais abaixo de 500 linhas; o único artefato gerado é o índice RAG. Após restaurar .env.example público que havia sido omitido da cópia temporária, o comando global check:file-lines final passou com o novo teste de navegação do Aluno: 3775 manuais auditados e 161 exceções/artefatos reconhecidos, sem alterar política nem criar exceções para este lote. A união final contém 51 arquivos, dos quais 50 manuais e o índice RAG gerado.

## Limitações e entrega

Conferência real no Chrome realizada pelo responsável: quatro famílias de cadastro no desktop, incluindo as 5 etapas de Aluno, 4 de Professor e 3 de PF; PJ e formulários auxiliares de Categoria/Tipo abertos e fechados, com ícones sem sobreposição. Depois da correção das chaves, Aluno avançou da etapa 4 para 5 sem popup prematuro de obrigatório. Listagem com 4 colunas, segunda página e seletor próprio de status conferidos; o filtro Inativos mostrou 2 entre 24 registros sintéticos. Responsáveis teve criação, filtro e aparência da confirmação conferidos; seleção de Pessoa Física abriu o formulário correspondente.

Na largura móvel de 390 px, o responsável conferiu PF real APÓS o CSS final: cabeçalho com rolagem horizontal, duas etapas inteiras e parte da terceira, rótulos sem quebra, campos de 44 px e uma coluna. Aluno e Professor usam o mesmo marcador de stepper, confirmado no markup; o CSS compartilhado foi aceito com essa evidência e a vista real de PF. Aluno após a correção das chaves foi conferido no desktop de 1146 px. A vista de Aluno a 390 px havia sido conferida antes do ajuste; não se afirma uma vista específica de Aluno a 390 px após todas as correções. As falhas intermitentes do navegador limitaram verificações adicionais. Nenhum teste de interface autoriza afirmar cobertura de todas as operações de Auth, envio, gravação ou acesso em produção. Nenhum cadastro real foi salvo, convite enviado ou documento gerado nesta conferência.

Build completo final APÓS o CSS móvel passou com Node 24.22.1: 4470 módulos transformados em 9,29 s e 26 páginas sociais geradas; checagem da versão 4.8.252 aprovada. O gate final auditou 3775 manuais e 161 exceções/artefatos reconhecidos, sem falhas; 14 testes de interface afetados passaram e o CSS final foi parseado. Esses checks cobrem as últimas correções de navegação, disabled e cabeçalho móvel, sem ampliar a cobertura visual ou operacional declarada.

Orientação mais recente do usuário: publicar AGORA o que já foi implementado — Financeiro 4.8.251 e Parceiros 4.8.252 — para ele conferir em produção depois. Essa instrução substitui a condição anterior de esperar todas as etapas. Caixa, Configurações, Comunicação e Biblioteca permanecem pendentes e não foram iniciados nesta rodada. A progressão futura continua por gate técnico entre módulos, sem exigir nova confirmação do usuário. Os 50 arquivos manuais e o CSS móvel final foram sincronizados por manifesto, backup e hashes. O índice RAG final contém 15 fontes e 80 trechos, sincronizados explicitamente; o corpus curado não inclui código ou fixtures de teste. Uma reindexação excepcional corrigiu a falha de CI causada pelos 81 trechos iniciais: escopo e frentes do LOTE foram reunidos em um parágrafo coeso, sem remover texto, fontes ou evidências e sem ampliar o teto de 80. A publicação remota será executada pelo responsável, não por esta frente.


## Correção encontrada na navegação do cadastro Aluno

O smoke real no Chrome revelou validação prematura do CEP ao avançar da etapa 4 para a 5. A comparação com a fonte anterior ao lote confirmou causa preexistente: o ternário de “Próximo” e “Salvar Cadastro” usava dois elementos button sem chaves distintas. React reaproveitava o nó e trocava seu type para submit durante o clique; com os campos finais já preenchidos, havia risco de envio sem clique explícito em Salvar.

A correção atribui chaves distintas apenas a esses dois botões, como já ocorre no formulário de Professor. As validações, obrigatórios, máscaras, callbacks, guarda de reenvio e payload permanecem iguais.

Teste-fonte DOM com o componente real percorre as etapas, preenche contato, retorna à etapa 4 e avança de novo: confirma etapa 5 visível, novo nó para Salvar, zero submits e zero onSave antes do clique explícito; após Salvar, confirma um submit e um onSave, sem I/O. O mesmo teste falha sobre a fonte anterior na asserção de reaproveitamento do botão, provando o controle negativo. Teste focado, lint dos dois arquivos e TypeScript completo passaram. Re-smoke real do responsável confirmou avanço 4→5 sem popup prematuro de obrigatório após as chaves distintas. As operações de cadastro em produção não foram executadas para esse teste.
