# Configurações compactas — etapa 3 de 3

## Objetivo e aceite

Após a validação do Financeiro e do Caixa, compactar o catálogo de Configurações e a apresentação do retorno/superfície interna. Preservar todas as opções, descrições, ordem, gates, componentes lazy, consultas, formulários e operações existentes.

Aceite: quatro cartões por linha no desktop, dois no tablet e um no celular; ícones centralizados na linha; abertura/retorno corretos e condições de exibição preservadas.

## Manifesto explícito

- `modules/gestor/configuracoes/ConfiguracoesPage.tsx`
- `modules/gestor/configuracoes/configuracoes-workspace.css`
- `ai/operacao/registros/alteracoes/2026-11-05-configuracoes-compactas.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

Total: 5 arquivos.

## Coordenação e risco

Três agentes solicitados: implementação da entrada/wrapper; harness de componentes reais; revisão independente. Coordenador integra e valida no Safari. Formulários internos, acesso, configurações bancárias, segredos e documentos fora do patch visual.

## Validação

- Lint focado aprovado. AST contra4.8.248 confirmou menuItems, renderSection,27lazyloads, query, hooks, flags, callbacks e rolagem preservados. CSS final25regras restritas à raiz do módulo e @media screen.
- Safari desktop: quatro cartões por linha, ícones centralizados, Categorias de Cadastros/Tipos de Parceria reais carregados e Voltar retorna ao catálogo.
- Safari390×744: catálogo legível em uma coluna, abertura e retorno da seção Tipos de Parceria conferidos. Perfil restrito mantém catálogo sem Produtos e Consulta Banese.
- Quatro combinações independentes availableBanese/canManageProductTypes confirmadas por renderização SSR do componente real; guardas idênticas à produção.
- Smoke detectou conteúdo presente no AX mas invisível no Safari após fadeIn de subseção. Regra restrita ao filho animado direto remove animation/transform/will-change; reteste mostrou conteúdo imediatamente. Revisão independente aprovou o escopo.
- Prévia usa fixtures sintéticas e I/O remoto bloqueado. Nenhuma configuração salva; não foi executada auditoria funcional de todos os formulários internos, que permanecem fora do patch.
- Fechamento integrado: TypeScript completo, build completo e check:file-lines passaram na candidate. Nenhum arquivo manual do manifesto acima500linhas (maior470).
- Três etapas implementadas e validadas sequencialmente em prévia local. Sem publicação nova autorizada.
