# Gestão compacta — 05/11/2026

## Objetivo e aceite

Repaginar a entrada da Gestão, o catálogo de turmas e o resumo interno das quatro modalidades, seguindo a escala compacta já aprovada para o início do Gestor. Prévia local para avaliação visual; sem pedido de publicação deste lote.

## Trabalho dos três agentes

- Entrada: cabeçalho, navegação de modalidades, indicadores e resumo das turmas em andamento.
- Catálogo: cartões, hierarquia dos dados, progresso e cabeçalhos de Técnicos, Livres, Especialização e EAD.
- Interior: cabeçalho compartilhado das turmas, navegação, indicadores e painéis de resumo.
- Integração: filtros compactos alinhados, ordenação sem quebra e botão nativo no nome da turma para abrir por teclado sem conflito com o menu de ações.

## Preservação e limites

Dados, filtros, consultas, cache, permissões e operações existentes mantidos. CSS restrito à mídia de tela; nenhum modelo ou exportador de documento alterado. Nenhuma matrícula, cobrança, edição de cadastro ou publicação executada. As alterações locais anteriores de Secretaria e Parceiros ficam fora deste manifesto. Esta rodada cobre entrada, catálogo, cabeçalhos e resumos; os formulários e demais fluxos internos mantêm seus componentes existentes.

## Manifesto explícito

- `modules/gestor/gestao/GestaoPage.tsx`
- `modules/gestor/gestao/resumo/GestaoResumo.tsx`
- `modules/gestor/gestao/gestao-entry-workspace.css`
- `modules/gestor/gestao/components/TurmasFilters.tsx`
- `modules/gestor/gestao/components/TurmaCard.tsx`
- `modules/gestor/gestao/tecnicos/GestaoTecnicos.tsx`
- `modules/gestor/gestao/livres/GestaoLivres.tsx`
- `modules/gestor/gestao/especializacao/GestaoEspecializacao.tsx`
- `modules/gestor/gestao/ead/GestaoEad.tsx`
- `modules/gestor/gestao/components/gestao-catalog-workspace.css`
- `modules/gestor/gestao/tecnicos/detalhes/TurmaTecnicoDetalhes.tsx`
- `modules/gestor/gestao/livres/detalhes/TurmaLivreDetalhes.tsx`
- `modules/gestor/gestao/especializacao/detalhes/TurmaEspecializacaoDetalhes.tsx`
- `modules/gestor/gestao/ead/detalhes/TurmaEadDetalhes.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/TurmaResumo.tsx`
- `modules/gestor/gestao/ead/detalhes/components/EadStatCard.tsx`
- `modules/gestor/gestao/components/TurmaDetailsHeader.tsx`
- `modules/gestor/gestao/components/gestao-turma-details.css`
- `ai/operacao/registros/alteracoes/2026-11-05-gestao-compact-workspace.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

Total: 21 arquivos.

## Validação

- ESLint focado dos componentes aprovado.
- TypeScript global e build completo aprovados no candidato isolado com base completa e Node 24.22.1.
- 34 testes existentes de acesso/navegação do Gestor aprovados, oito contratos de progresso de turmas e cinco contratos de acesso EAD aprovados pelos agentes.
- Safari nativo desktop: resumo global e catálogo técnico inspecionados; abertura do resumo técnico, retorno à listagem, troca para EAD e abertura de seu resumo conferidos com componentes reais e dados sintéticos.
- Prévia com serviços remotos bloqueados. Sessão autenticada e operações com dados reais não foram exercitadas; viewport móvel e demais abas internas permanecem pendentes de smoke antes de publicação.
- Todos os arquivos deste manifesto abaixo de 500 linhas. O workspace principal possui referências legadas ausentes fora deste lote; tipagem, build e checagem integral são realizados no candidato completo, sem corrigir silenciosamente esses outros domínios.

## Entrega

Prévia: `http://127.0.0.1:3012/tmp/gestao-layout-preview/`.
Aceite visual pendente. Nenhuma atualização de GitHub ou produção neste lote.

## Publicação autorizada

Responsável autorizou a publicação conjunta após recapitulação. Entrega remota acompanhada em [2026-11-05-publicacao-visual-gestor-4-8-248.md](./2026-11-05-publicacao-visual-gestor-4-8-248.md).
