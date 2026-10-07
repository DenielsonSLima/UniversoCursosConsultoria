# Rolagem única no conteúdo do Portal do Gestor

Data: 2026-10-07
Versão: 4.8.179, revisão 188
Estado: patch e revisão de código concluídos; CI e Preview em conferência. Validação visual posterior assumida pelo usuário.

## Objetivo e evidência

As quatro fotos fornecidas mostram a aba Financeiro da turma técnica com duas barras verticais na borda direita. A rolagem externa deixa a área de conteúdo vazia, sem avançar a lista. O Shell tinha overflow-auto tanto no main quanto no div interno de conteúdo. Essa estrutura confirma dois proprietários potenciais de rolagem; a dinâmica exata não foi reproduzida em sessão autenticada.

O patch mantém o main como único proprietário, retira a rolagem interna e move para ele o contentScrollRef já usado no reset de navegação. O conteúdo continua em fluxo normal, com seu tamanho mínimo natural. Não se oculta a rolagem de listas financeiras ou modais.

## Escopo e preservação

- Main continua rolável, preservando a possibilidade de alcançar os popovers do cabeçalho.
- Altura dinâmica de viewport, com fallback de 100vh, e largura mínima flexível.
- Cabeçalho sticky fica abaixo da barra fixa mobile; scroll-padding reserva a área do cabeçalho para foco e alvos de navegação.
- Main conserva o landmark nativo, ganha foco por teclado e indicador de foco visível, sem interceptar roda, teclado ou toque.
- Cálculos, cobranças, contratos, permissões, dados e navegação de domínio não mudam.
- Base do pacote: main 94c622a23e85c726fcf1a7c820cce7dca17c5a98, versão 4.8.178 já integrada. Marca Banese, paginação do contrato e correções do Caixa preservadas.
- Nenhuma imagem ou dado real integra o commit.

## Validação

- Seis contratos de fonte passaram; cinco falham no baseline e um já passava.
- Esbuild compilou os dois arquivos TSX afetados.
- TypeScript 5.8.2 em modo strict/noEmit aprovou os dois componentes reais e a compatibilidade do ref criado por GestorPage; dependências laterais foram substituídas por declarações no harness. Não equivale a typecheck integral.
- Tailwind 3.4.17 gerou as classes novas de viewport, overscroll e scroll-padding.
- Revisão independente não encontrou bloqueadores restantes após corrigir os riscos de clipping dos popovers e sobreposição do cabeçalho mobile.
- Teto de 500 linhas verificado para o manifesto; CI integral deve confirmar os demais controles do repositório no commit final.
- Smoke Safari autenticado não executado. O usuário informou que fará a conferência visual posteriormente e pediu concluir o ajuste interno. Roteiro de conferência: roda/toque até a última linha e de volta, teclado, janela baixa/zoom, opções finais dos seletores, abrir/fechar modais, troca de módulo/turma e reset de topo.
- Tentativa de fixture sintética não iniciou o navegador por restrição de socket do executor; não é evidência de geometria ou interação aprovada.
- Nenhuma fonte padrão do índice RAG foi alterada.

## Manifesto explícito

Total: 8 arquivos

- `modules/gestor/components/GestorPortalShell.tsx`
- `modules/gestor/components/GestorPortalHeader.tsx`
- `modules/gestor/components/gestor-portal-scroll.contract.test.mjs`
- `.github/workflows/gestor-portal-scroll.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-07-gestor-rolagem-unica.md`
