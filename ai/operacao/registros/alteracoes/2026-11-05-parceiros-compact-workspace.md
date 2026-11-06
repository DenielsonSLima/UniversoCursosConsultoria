# Parceiros compacto — 05/11/2026

## Objetivo e aceite

Refinar a listagem de Parceiros e a ficha interna do aluno apresentada nas capturas, seguindo a direção compacta do início do Gestor: tipografia leve, hierarquia discreta, ícones alinhados e preservação das informações e operações. Prévia local para revisão; sem publicação neste lote até o aceite e pedido explícito.

## Implementação

- Indicadores agrupados em faixa discreta, com os mesmos totais e estados retornados.
- Lista em até quatro colunas, conforme revisão solicitada, cartões compactos para Aluno, Professor, PF e PJ, com nomes de pessoas permitindo quebra e menus preservados.
- Cabeçalho da ficha, abas, leitura dos campos e área da Secretaria com escala e espaçamentos menores.
- CSS restrito aos componentes e à mídia de tela. Formulários de edição, seletores, consultas, autorização, financeiro e modelos/exportadores de documentos mantidos.
- Alterações locais anteriores da Secretaria ficam fora deste manifesto.

## Manifesto explícito

- `modules/gestor/parceiros/ParceirosPage.tsx`
- `modules/gestor/parceiros/components/ParceirosKpis.tsx`
- `modules/gestor/parceiros/components/ParceirosList.tsx`
- `modules/gestor/parceiros/components/cards/AlunoCard.tsx`
- `modules/gestor/parceiros/components/cards/ProfessorCard.tsx`
- `modules/gestor/parceiros/components/cards/PFCard.tsx`
- `modules/gestor/parceiros/components/cards/PJCard.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoDetalhes.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoNavigation.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoDados.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoDisplayField.tsx`
- `modules/gestor/parceiros/aluno-card-typography.contract.test.ts`
- `modules/gestor/parceiros/parceiros-workspace.css`
- `modules/gestor/parceiros/components/viewparceiros/aluno/parceiro-profile.css`
- `ai/operacao/registros/alteracoes/2026-11-05-parceiros-compact-workspace.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

Total: 17 arquivos.

## Validação

- ESLint focado aprovado.
- Doze testes de identidade, filtros e hidratação aprovados.
- TypeScript global aprovado no candidato isolado com a base completa já validada no lote anterior.
- Workspace principal tem erros de arquivos ausentes e contratos divergentes em outros-créditos, fora deste manifesto; não foram alterados para este layout.
- Safari nativo: quatro cartões na mesma linha do desktop confirmados; abertura da ficha, leitura de Cadastro, troca para Secretaria e retorno à listagem conferidos. Dados exclusivamente sintéticos, servidor local com destino remoto bloqueado; nenhuma operação de cadastro, pagamento ou emissão executada.
- Viewport móvel ainda não conferida nesta rodada.
- Todos os 17 arquivos do manifesto abaixo de 500 linhas. A checagem global no workspace aponta referências legadas ausentes, fora do lote; no candidato completo, `npm run check:file-lines` passou.

## Entrega

Prévia local: `http://127.0.0.1:3012/tmp/parceiros-layout-preview/`.
GitHub e produção ainda sem publicação deste lote. Aceite visual pendente.

## Publicação autorizada

Responsável autorizou a publicação conjunta após recapitulação. Entrega remota acompanhada em [2026-11-05-publicacao-visual-gestor-4-8-248.md](./2026-11-05-publicacao-visual-gestor-4-8-248.md).
