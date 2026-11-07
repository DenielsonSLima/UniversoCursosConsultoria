# Parceiros: carregamento, paginação e polo

Análise de 07/11/2026, solicitada junto da padronização dos cadastros. Evidências: código ativo, consulta MCP de metadados/agregados no projeto Universo e documentação oficial. Nenhum cadastro, vínculo, configuração, RLS ou migration foi alterado. Não foram registrados dados pessoais.

## O que foi confirmado

| Pergunta | Evidência | Conclusão |
| --- | --- | --- |
| Busca todos os dados? | `useParceirosQueries` chama `getAll('todos', scope)`; serviço usa `select('*', relações)` sem range/limit. | Busca todo o conjunto devolvido pelo servidor para o escopo. Um limite externo pode truncá-lo; a tela não trata esse caso. |
| Paginação reduz a rede? | `ParceirosList` aplica `slice` de 20 depois da resposta. | Não. É paginação local de uma lista já carregada. |
| Ignora o polo? | Serviço filtra `polo_id` OU `polo_ids`; chamador passa `scopedPoloId`. | O filtro existe na consulta do servidor. PJ global e outros cadastros globais têm exceções expressas; Aluno não vira global por essa flag. |
| Por que a troca pode ser instantânea? | Cache tem chave por polo + local/global, `staleTime: Infinity` e retenção de 30 min. Busca e filtros são locais. | Cache previamente carregado pode aparecer imediatamente, inclusive durante revalidação por Realtime. Isso não comprova erro de isolamento. |
| Há custo adicional? | Após parceiros, carrega matrículas de todos os alunos + configuração acadêmica; depois verifica e-mail de todos em lotes de até 500. | Existe uma cadeia de consultas e enriquecimento integral. Não é uma consulta por aluno, mas o custo cresce com o conjunto. |

Na consulta agregada remota havia 517 parceiros, dos quais 476 Alunos. Esses números são do projeto inteiro e não equivalem ao retorno de um gestor/polo específico. A RLS de leitura confirma vínculo próprio ou escopo permitido ao gestor; não foi usado esse acesso administrativo como prova do resultado de uma sessão de usuário.

A pesquisa do cabeçalho é outro fluxo: navegar por seu resultado pode trocar para o polo do resultado antes de abrir a ficha. O texto da pesquisa interna de Parceiros também permanece ao trocar o polo. Esses comportamentos precisam ser distinguidos no caso relatado.

## O que ainda não se pode concluir

- Não há medição de milissegundos ou bytes de uma sessão autenticada representativa. O tempo exato de rede, a contribuição de fotos e a latência da Edge Function permanecem pendentes de medição.
- Não foi reproduzido o aluno específico mencionado entre polos; o relato não identifica qual cadastro e quais polos. Um cadastro pode ter vínculos em mais de uma unidade.
- Matrículas visíveis de outros polos podem entrar no resumo do aluno. A matrícula principal atual é escolhida por situação/data, sem priorizar o polo ativo. É necessário definir se o cartão representa identidade global ou resumo acadêmico no polo antes de mudar isso.
- O limite de linhas configurado no PostgREST não foi consultado. A documentação informa um limite padrão, mas não se presume que produção use esse valor.

## Boas práticas e comunidades consultadas

Supabase oferece projeção de colunas e paginação por intervalo; o intervalo respeita a ordenação e seus extremos são inclusivos. O catálogo deve combinar filtros autorizados, ordem estável, página e contagem coerente antes de enviar os registros. [Supabase: range](https://supabase.com/docs/reference/javascript/range), [select e contagem](https://supabase.com/docs/reference/javascript/select).

TanStack Query recomenda incluir na chave todas as variáveis da consulta. Polo, acesso global, pesquisa, filtros, ordenação e página precisam identificar a nova leitura paginada. [Documentação oficial de query keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys).

Nas discussões da comunidade, o mantenedor TkDodo explica que voltar a uma página já armazenada pode mostrar o cache imediatamente; também relaciona colisões de cache à ausência de variáveis na chave. Esses relatos esclarecem o mecanismo da biblioteca, sem comprovar sozinhos o comportamento deste projeto. [Discussão #3640](https://github.com/TanStack/query/discussions/3640), [Discussão #7511](https://github.com/TanStack/query/discussions/7511).

`placeholderData` é uma escolha de transição. Não se deve apresentar os alunos do polo anterior como se fossem o novo escopo; a interface precisa indicar atualização quando mantém uma página do mesmo escopo. [Paginated queries](https://tanstack.com/query/latest/docs/framework/react/guides/paginated-queries).

## Correção recomendada em etapas

1. Medir uma leitura fria e outra com cache do mesmo polo: número de requests, bytes, duração de parceiros/matrículas/e-mails e tempo até os primeiros 20 cartões. Guardar apenas métricas agregadas.
2. Criar leitura paginada aditiva própria de Parceiros. Na auditoria local e na lista remota consultada não foi identificado contrato geral reutilizável com todos os filtros da tela. A busca global limitada a 20 resultados não substitui essa leitura.
3. Aplicar pesquisa, tipo, status, modalidade e turma no servidor antes da paginação; preservar a busca normalizada atual. Selecionar apenas colunas necessárias aos cartões e complementar matrículas/e-mails somente dos 20 IDs devolvidos. Detalhes completos são consultados ao abrir a ficha.
4. Incluir todas as variáveis na query key, adicionar debounce/cancelamento, reiniciar página na troca de escopo/filtro e mostrar erro/retry/atualização. Ajustar Realtime para invalidar as páginas do escopo afetado.
5. Manter KPIs canônicos separados da página. Exportação deve carregar o conjunto filtrado completo somente quando solicitada, sem confundir uma página com o total. Validar vínculos múltiplos e respostas tardias de um polo anterior.
6. Comparar o mesmo cenário antes/depois. Índices só após plano de execução e evidência; não alterar RLS nem limpar cache global como tentativa de corrigir carregamento.

Não foi colocado `range(0,19)` no `getAll` atual: como a busca/filtros/exportação operam sobre essa lista, isso faria alunos desaparecerem dos resultados. A mudança visual não alterou o contrato de consulta. A implementação da paginação é um lote de dados próprio, posterior a esta análise.

## Skills utilizadas

`universo-response-time-optimization`, `universo-supabase-data-performance` e `supabase` já estavam disponíveis e foram aplicadas. Não foram criadas cópias redundantes. A nova skill `universo-interface-compacta` registra somente o padrão visual solicitado, sem autorizar alterações de banco ou publicação.
