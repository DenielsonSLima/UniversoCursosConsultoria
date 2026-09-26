# Redução de chamadas ociosas do dispatcher push — 25/09/2026

Estado: PUBLICAÇÃO — migration aplicada; pós-checagem e smoke natural aprovados; release 4.8.91 pronta para revisão.

## Objetivo e aceite

Evitar chamadas Edge do dispatcher quando nenhuma fila precisa de trabalho, mantendo a avaliação a cada minuto e os contratos de entrega, retry, expiração, campanhas e limpeza de imagens. Continuação operacional do [incidente de login e logs](2026-09-25-incidente-login-logs.md), autorizada para reduzir consumo desnecessário e normalizar o ambiente.

Aceite: gate fiel ao contrato dos workers, execução privada, cron original preservado fora da condição de chamada, 39 cenários SQL aprovados e três execuções naturais vazias sem invocação Edge. Não criar mensagem artificial, campanha ou cobrança para testar.

## Diagnóstico e alteração

- O scheduler invocava o dispatcher a cada minuto mesmo sem trabalho elegível. A condição passa a ser avaliada no banco antes de `net.http_post`.
- Nova função `comunicacao_private.push_dispatch_required()`: SQL, STABLE, SECURITY INVOKER, `search_path=''`, owner e EXECUTE apenas `postgres`; schema privado continua sem USAGE para `anon`, `authenticated` e `service_role`.
- O gate considera filas institucionais e de suporte público, entrega com retry, leases vencidos, quiet hours, políticas desativadas, expiração, imagens referenciadas e campanhas prontas ou concluídas. As funções claim/CAS do worker permanecem intactas.
- O cron preserva endpoint, consulta ao segredo, payload, timeout, owner, estado ativo e frequência. O comando ganha somente a chamada ao gate, 46 bytes; o predicado extenso fica fora do comando copiado para os logs.
- A migration verifica fingerprints dos três claims e do cron antes de alterar; divergência interrompe a transação. Não altera retenção de logs, dados financeiros ou histórico de falhas.

## Manifesto explícito

- `supabase/migrations/20260926002500_skip_idle_push_dispatcher_invocations.sql`
- `supabase/tests/push_dispatch_idle_gate.readonly.mjs`
- `ai/operacao/registros/alteracoes/2026-09-25-reducao-chamadas-ociosas.md`
- `ai/operacao/registros/alteracoes/2026-09-25-incidente-login-logs.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 8 arquivos.

## Validação

- Revisão independente confrontou o gate com as funções remotas de claim e o worker v16, equivalentes às fontes revisadas.
- 39/39 cenários passaram via SQL somente leitura. O gerador não executa cron, worker, Firebase, `net.http_post` ou mutações.
- Migration aplicada via MCP em 26/09 entre 00:43 e 00:44Z (25/09, 21:43–21:44 locais), ledger `20260926004328`, nome `skip_idle_push_dispatcher_invocations`. Fonte versionada `20260926002500_skip_idle_push_dispatcher_invocations.sql` preservada.
- Quatro pós-checagens retornaram true: definição/ACL do gate, privacidade do schema, cron/frequência e fingerprints dos claims. Às 00:44:23Z o gate retornou false, coerente com ausência de trabalho.
- Smoke natural via MCP: execuções às 00:44:00.179–00:44:00.318Z, 00:45:00.332–00:45:00.480Z e 00:46:00.383–00:46:00.470Z concluíram como succeeded, zero linhas. Nenhum envio artificial foi criado.
- Logs `function_edge_logs` entre 00:40 e 00:47Z mostram uma invocação por minuto às 00:40, 00:41, 00:42 e 00:43; zero a partir de 00:44. A observação confirma supressão de invocações ociosas nessa janela, sem alterar a frequência do cron.
- Versão 4.8.91 registra esta alteração de banco conforme o contrato de CI do repositório, sem mudança adicional na interface de login.
- Build 4.8.91 aprovado: 4.050 módulos, 8,31 s; check:version, check:file-lines e diff --check aprovados. Apenas aviso conhecido de chunks acima de 500 kB. Nenhum artefato gerado integra o manifesto.

## Limites e acompanhamento

- A economia se aplica às invocações sem trabalho desse dispatcher; outros crons e fontes de logs permanecem. Não há medição pós-alteração suficiente para prometer menos de 1 GB por ciclo.
- Banco principal medido em 481,83 MB; soma com templates em 496,95 MB. O maior volume é histórico financeiro e seus índices, não cache descartável. Nenhuma exclusão ou recompactação de histórico foi executada; a folga física atual não estava confirmada para autorizar essa manutenção.
- Regressão futura deve atualizar conjuntamente o predicado e seus cenários quando o contrato de claim mudar. A migration aplicada deve permanecer imutável.
