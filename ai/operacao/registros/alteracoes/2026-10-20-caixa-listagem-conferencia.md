# Caixa: listagem dos registros em conferência

Estado: BACKEND_APLICADO_EM_PUBLICACAO. Versão de entrega 4.8.228/revisão237.
Pedido: corrigir a listagem, revisar com três agentes e atualizar o GitHub.
Aplicação e entrega solicitadas pelo usuário em 20/10/2026; teste de tela
reservado ao usuário. Navegador excluído após sua orientação expressa.
Classificação: crítica, leitura financeira. Sem limpeza de histórico.

## Causa comprovada

- RPC `get_caixa_review_pending_page_secure` falha com SQL57014 no limite8s.
- EXPLAIN ANALYZE remoto:9.619,213ms totais; base1.609,085ms e hidratação8.008,466ms.
- Dez buscas de observação consomem800,117ms cada no índice existente
  `(run_id,unit_id,invoice_id)`, com123.432 buffers em cache e10.421 lidos.
- Tabela com1.122.572 observações estimadas; são registros históricos locais,
  não chamadas à API geradas pela abertura do painel.
- Não foi demonstrada regressão causada pela entrega do PDF4.8.227;
  a busca problemática é adicional à leitura do resumo e usa outra cadeia.

## Correção e aceite

- Única alteração de execução: índice parcial por snapshot_id/invoice_id,
  seguido de observed_at/recorded_at/id decrescentes, incluindo source_status.
- Preserva SQL das funções, filtros, motivos, cortes, ordenação, cálculos,
  grants/RLS e fatos financeiros. Nenhum frontend ou compositor foi alterado.
- Migration transacional: lock_timeout2s e statement_timeout30s locais.
  CREATE INDEX bloqueia brevemente escritas na tabela; timeout reverte tudo.
- Aceite: ambas as RPCs retornarem no limite8s, com os mesmos payloads,
  quantidades e valores; índice válido e definição/ACL das funções intactas.

## Validação e revisão

- Três agentes concluíram revisão final: frontend, SQL e regressão/PDF.
- Frontend:10/10 testes focados aprovados.
- SQL PG17:100mil observações/100execuções históricas, buffers2.030→7;
  payloads integrais mensal/carteira, identidade, desempates, paginação,
  cortes, ACL e imutabilidade preservados. Ensaio repetido independentemente.
- Ensaio adicional: ACL/RLS/metadados preservados, timeouts não vazam
  sessão e conflito de índice aborta a transação sem efeito parcial.
- Baseline real outubro:MONTHLY4/R$1.119,60; FUTURE10/R$2.799,00.
  Hashes sem geradoEm:7cf79e0c3d02704d39f322da0f27d176 e
  e6bfa3f52eb16c97ee09bb41d5f0fb99, respectivamente.
- Supabase exclusivamente pelo MCP configurado para Universo
  kfekgwyqozhicpfuunpo; conector de apps sem acesso foi descartado.
- Entrega sobre main8d14ee34, preservando alterações locais paralelas.
  Metadados de publicação preparados sobre os arquivos remotos vigentes.

## Manifesto explícito

- `supabase/migrations/20261021001000_index_caixa_review_observation_lookup.sql`
- `supabase/tests/caixa_review_drilldown.isolated.test.mjs`
- `ai/operacao/registros/alteracoes/2026-10-20-caixa-listagem-conferencia.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 7 arquivos.

## Resultado remoto

Migration aplicada via MCP no ledger20261021022020. Índice válido/pronto,
99.909.632 bytes; funções com hashes idênticos e ACL preservadas.
Primeira tentativa abortou no orçamento DDL8s; readback confirmou ausência de
índice/ledger e rollback integral. Três agentes reaprovam orçamento DDL30s;
lock_timeout2s e limite8s das consultas permanecem inalterados.
Após aplicação: consulta completa1.584,165ms; lookup0,019ms por item e41 buffers,
contra8.001ms/133.853 buffers no total dos dez lookups anteriores.
RPCs reais MONTHLY/FUTURE executadas no limite8s; hashes,4/10 registros e
R$1.119,60/R$2.799,00 idênticos ao baseline.
Validação de linhas do manifesto de entrega aprovada. Checagem global local
mantém ausências preexistentes fora do lote; publicação usa a base remota íntegra.
Versão/changelog preparados sobre main vigente sem sobrescrever versões locais
paralelas. CI/build da entrega serão verificados no GitHub antes do merge.
Smoke visual reservado ao usuário; nenhum histórico limpo ou dado financeiro alterado.
