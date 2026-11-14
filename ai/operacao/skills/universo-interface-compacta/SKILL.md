---
name: universo-interface-compacta
description: Aplicar e revisar o padrão visual compacto aprovado do Portal Universo em páginas, cartões, abas e cadastros, preservando informações e contratos. Usar em ajustes de interface deste projeto; não implica alterar regras, PDFs, acesso a dados ou autorizar publicação.
---

# Interface compacta do Universo

Preservar o padrão já aprovado pelo usuário. Consultar `docs/design/interface-compacta.md` no repositório para tokens, referências e critérios visuais; abrir somente o domínio solicitado.

## Decisões do padrão

- Fontes do sistema; corpo de 13 px, metadados e rótulos de 12 px, peso regular/500. Reservar 600 para títulos e valores. Evitar caixa alta e espaçamento entre letras no conteúdo comum.
- Campos brancos com borda discreta, raio de 8 px e altura de 38 px no desktop; 44 px e fonte de 16 px em campos móveis. Manter contraste legível nos metadados.
- Abas de navegação com linha inferior de 2 px no item ativo, sem cápsula preenchida. Controles de escolha múltipla mantêm sua semântica de filtro.
- Ações à direita, alinhadas à navegação ou filtros quando houver espaço. No móvel, permitir quebra sem recortar rótulos.
- Cartões com bordas suaves, pouco relevo, ícones centrados verticalmente e hierarquia clara. Parceiros usa quatro colunas no desktop amplo, reduzindo conforme a largura.
- Formulários com cabeçalho enxuto, etapas compactas, seções separadas por linhas e rodapé claro. Formulários longos preservam rolagem e todos os campos, avisos, validações e ações.
- Remover apenas títulos e descrições que repetem a navegação sem acrescentar informação. Não apagar ajuda operacional, status, composição de valores ou permissões.

## Atualização automática

- Não oferecer botões manuais para atualizar, recarregar ou sincronizar dados. O sistema usa TanStack Query e Realtime: invalidar o menor escopo após mutações/eventos, recuperar conexão automaticamente e usar retry limitado. Mostrar estado de carregamento/erro sem transferir a atualização dos dados ao usuário.

## Seletores próprios

Para opções de identidade fechada, usar `modules/shared/components/InstitutionalSelect.tsx` ou um picker existente equivalente do domínio. O texto de busca não substitui o ID selecionado. Não usar `<select>`/`<datalist>` nativo nos campos incluídos no pedido.

Abrir opções permitidas com busca vazia, filtrar texto com acentos, preservar ID e estados de erro/carregamento/vazio. Suportar setas, Enter, Escape, Tab, foco e ARIA; portais não podem escapar de `fieldset disabled`. Campo obrigatório valida o ID canônico mesmo quando o texto de busca está vazio. Catálogos que aceitam texto livre continuam usando o combobox editável existente.

Referências existentes: `FinancialSelect.tsx` no Financeiro (mesmo contrato), `partner-registration.css` nos cadastros, `partner-cards.css` nos cartões. Reutilizar sem acoplar regras de negócio de um módulo ao outro.

## Conferência proporcional

Comparar antes/depois na largura afetada e em uma largura móvel. Exercitar o formulário real: etapas, seletores, texto longo, obrigatório e estado pendente. Conferir que campos, valores enviados, regras de escopo e handlers foram preservados. Dados sintéticos validam interface, não comprovam autorização ou latência de produção.

Preferências de navegador e publicação vêm do pedido atual e das regras locais. Esta skill não amplia permissões nem exige uma publicação.
