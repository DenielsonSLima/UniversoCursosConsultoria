# Emissor NFS-e — continuidade dos indicadores

## Causa e escopo

As consultas workspace, documentos e fila descartavam o cache imediatamente ao perder
seu último observador (`gcTime: 0`). Ao reabrir o módulo, os indicadores voltavam ao
estado vazio. O total emitido também era ocultado durante qualquer `isFetching`,
inclusive revalidação de dados já conhecidos do mesmo período.

Usa a mesma política do QueryClient global, extraída sem alterar os valores:
frescor por cinco minutos e retenção em memória por trinta minutos sem observadores. As
chaves existentes incluem contexto de acesso, polo, ambiente, mês e filtros, sem
`placeholderData` de outro escopo. Não retém decisões de autorização. A troca de
sessão/contexto continua limpando o QueryClient pelo fluxo institucional existente.

O total conserva o valor conhecido durante refetch; erro, falta de acesso e edição
pendente de datas continuam ocultando-o. Realtime, recuperação da assinatura,
reconexão, foco e invalidações por mutações permanecem ativos. Ainda pode haver
consulta em segundo plano após uma ausência: Realtime não garante entrega de
mudanças ocorridas enquanto o módulo estava desmontado.

## Manifesto

- `index.tsx` (apenas extrai valores idênticos da política global)
- `lib/query-cache-policy.ts`

- `modules/gestor/emissor-nfse/hooks/useNfseQueries.ts`
- `modules/gestor/emissor-nfse/fila/useNfseQueue.ts`
- `modules/gestor/emissor-nfse/emitidas/NfseIssuedTotalMetric.tsx`
- `modules/gestor/emissor-nfse/queries/nfse-summary-cache.ts`
- `modules/gestor/emissor-nfse/queries/nfse-summary-cache.interaction.test.mjs`
- `modules/gestor/emissor-nfse/emitidas/NfseIssuedPeriod.interaction.test.mjs`
- `modules/gestor/emissor-nfse/realtime/nfse-summary-multiuser.test.mjs`
- Este registro.

## Validação

Dois testes DOM e um teste multiusuário de Realtime passaram: hooks reais com remount, refetch, limpeza de sessão e
isolamento de contexto/polo/ambiente/período; KPI com revalidação em segundo plano,
erro, datas não aplicadas e falta de acesso. Dois QueryClients independentes
recebem o mesmo evento de outro usuário, revalidam imediatamente sem cruzar contexto,
e a reconexão recupera mudanças durante a indisponibilidade do canal. TypeScript e ESLint direcionados no
fechamento do lote. Smoke autenticado no Safari pendente por indisponibilidade do
Mac; testes sintéticos não substituem essa conferência. Nenhuma operação fiscal,
migration, permissão, cálculo ou dado financeiro foi alterado.

## Comparação com o padrão existente

`index.tsx` já define staleTime de cinco minutos e gcTime de trinta minutos.
`useModalidadeReceberQueries` repete os mesmos valores; leituras do Caixa usam
retenção de trinta minutos com frescor menor específico. As projeções de resumo
NFS-e agora importam a política global, sem cronômetro isolado. O foco/reconnect
continuam habilitados no domínio fiscal como antes, e a assinatura de eventos
revalida em background para cobrir alterações de outros usuários durante ausência.
O dado não espera cinco minutos para refletir um evento. Nenhum timer de polling
foi criado.
