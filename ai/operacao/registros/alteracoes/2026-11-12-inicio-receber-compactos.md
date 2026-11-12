# Início e A Receber: espaço e ordem dos controles

## Pedido e autorização
Usuário pediu remover o cabeçalho redundante da tela inicial; substituir períodos prontos e resumo de vencimentos por datas após a busca; e ordenar A Receber como Contas a Pagar. Publicação no GitHub e em produção foi solicitada explicitamente em 12/11/2026. Conferência visual reservada ao usuário, sem novas interações do agente com o navegador.

## Aceite
- Início sem “Seu espaço de gestão”, “Visão geral” e data redundante.
- A Receber na ordem: KPIs, abas de situação/visualização, busca, datas e turma, lista.
- Data inicial e final sempre disponíveis após a busca; sem presets nem linha “Vencimentos de”.
- Preservar mês civil inicial, validação de intervalo, filtros comuns da lista/totais/relatório, permissões e handlers.
- Trabalho paralelo de Parceiros/4.8.320 fora deste pacote.

## Validação e limites
Quatro testes da toolbar e oito de período aprovados; sintaxe TSX e diff sem erros. Revisão independente dos quatro arquivos sem regressão concreta identificada. Início conferido localmente no Safari antes da instrução de parar o navegador; Financeiro terá conferência visual do usuário. Nenhuma regra de cálculo, banco, Auth, PDF ou Edge alterada.

Candidato 4.8.321, revisão 330, parte de main abaa26532dc646a1797431b4f7843aa99dae2fa5 (produção 4.8.319). A numeração 4.8.320 está reservada ao candidato paralelo de Parceiros. Build completo, CI e Preview do commit isolado são exigidos antes do merge. O snapshot de publicação não sobrescreve a versão nem o lote do checkout paralelo.

## Manifesto explícito
Total: 10 arquivos

- `modules/gestor/dashboard/DashboardPage.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/ReceivablesPeriodFilter.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/ModalidadeReceberToolbar.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/modalidade-receber-toolbar.test.tsx`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-07-versao-4-8-251.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-12-inicio-receber-compactos.md`


## Publicação concluída
- PR [#414](https://github.com/DenielsonSLima/UniversoCursosConsultoria/pull/414) integrada em main; commit de produto `297cbefcbabbcb69d9979719af5a65cf05ae00f9`.
- Candidato `07a916643c3bd0d6fe0f7bf23667f2547f4ba9e6`: seis workflows concluídos com sucesso, incluindo TypeScript, lint, testes e build completo; Preview Vercel READY e HTTP200.
- Produção `dpl_1p6bhcvYCumxKKfmStqdbBGHaPjN` READY, target production, aliases oficiais atribuídos ao commit do merge.
- `https://www.universocc.com.br/gestor` e `/assets/main-BYWYNYGA.js` retornaram HTTP200; bundle contém a versão 4.8.321.
- Conferência HTTP realizada pelo conector Vercel, sem navegador. DNS do terminal estava indisponível; não substituiu nem invalidou a verificação pelo conector.
- Teto de linhas aprovado e índice local regenerado uma vez. Conferência visual de A Receber permanece com o usuário.
