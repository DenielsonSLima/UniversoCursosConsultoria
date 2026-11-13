# NFS-e: recuperação do retorno automático — 4.8.326

## Ocorrência e autorização

O usuário relatou, às 21:22 de 12/11, uma emissão real de curso Técnico de R$ 260,00 ainda aguardando confirmação na aplicação local. Autorizou corrigir e publicar o retorno automático. A análise usou MCP, código e testes sintéticos, sem navegador. O agente não reenviou a DPS nem pediu cancelamento.

Operação original: `fb5d5e49-0f69-4664-bccc-db2d0d3c8f1d`; job: `f3186a30-a2f8-4d35-b787-979649b77225`. A recuperação confirmou a NFS-e nº 2 dessa mesma operação. Não foi criada outra identidade fiscal.

## Causas reproduzidas

1. A fila central estava habilitada, com cron ativo por minuto, leases e consumo funcionando. Entretanto, toda chamada a `get_nfse_reconciliation_material_internal` retornava HTTP 400 antes de qualquer consulta fiscal. O log PostgreSQL revelou SQLSTATE `2201B`, expressão regular inválida no quantificador `{1,4096}` de `protectionBypass`. O worker classificava esse erro desconhecido como `TRANSPORT`; após onze tentativas, o backoff já era de 300 segundos. A fixture anterior omitia o token e não alcançava esse ramo.
2. A resposta do envio apresentava `idDps` com prefixo `NFS`. O parser exigia exclusivamente o identificador `DPS` e persistia `RESPONSE_DPS_MISMATCH` antes de validar o XML autorizado. Esse defeito era independente da falha SQL que impedia a reconciliação central.

PostgreSQL permite limites de repetição somente entre 0 e 255. A correção mantém o limite comercial de 4096 por `length`, separado da validação dos caracteres. Referência: [documentação PostgreSQL 17](https://www.postgresql.org/docs/17/functions-matching.html#FUNCTIONS-POSIX-REGEXP).

## Correção e guardas

- Migration nova `20261112224000_nfse_reconciliation_relay_token_validation.sql`: altera somente a validação do token em `get_nfse_reconciliation_material_internal`, preservando URLs aprovadas, chaves permitidas, credencial, lease, `SECURITY DEFINER`, `search_path` vazio e execução exclusiva de `service_role`. A migration aplicada anterior permanece imutável.
- Identidade JSON compartilhada entre emissão e worker: cada alias presente deve ser a DPS exata ou `NFS` concatenado à mesma `chaveAcesso` de 50 dígitos. Alias conflitante, outra chave, ambiente divergente ou XML incompatível continuam recusados.
- A autorização continua exigindo XML válido, `cStat=100`, identificador da DPS interna, ambiente de produção, semântica integral igual à DPS assinada, CNPJ do emitente e componentes coerentes da chave de acesso. JSON serve apenas ao encaminhamento da leitura.
- O worker continua restrito a GET do próprio documento/evento. Não foi introduzido POST fiscal, cancelamento, reenvio, nova preparação, mudança financeira ou empréstimo de sessão de usuário.

## Implantação e evidência real

Horários de 12/11/2026 em `America/Maceio` (UTC−03). Dados obtidos de auditoria, metadados e logs; nenhum XML, nome, documento pessoal ou segredo integra este registro.

| Horário local | Evidência |
| --- | --- |
| 21:21:58.624195 | Enfileiramento da operação original. |
| 21:22:02 a 21:30:06 | Material RPC 400; tentativas concluídas como `TRANSPORT`. |
| 21:31:25 | Migration aplicada por MCP; ledger remoto `20261113003125`, nome `nfse_reconciliation_relay_token_validation`. |
| 21:35:07.977006 | O cron retomou a mesma fila na tentativa 12, após o vencimento original do backoff. |
| 21:35:08.009 | `get_nfse_reconciliation_material_internal` passou a retornar 200. |
| 21:35:11.219 | `complete_nfse_reconciliation_proof_internal` retornou 200. |
| 21:35:11.237974 | Operação `AUTHORIZED`, XML autorizado presente, job `DONE` e evento Realtime no mesmo commit. |

Edges implantadas pelo responsável: `nfse-reconciliation-worker` v2 e `nfse-national-individual` v34, com JWT verificado. A retomada observada não exigiu novo envio nem alteração operacional do job pelo agente.

## Conferência da fila, Realtime e acesso

- A projeção acadêmica passou a `AUTHORIZED`/`EMITIDA` e deixou de integrar a seleção padrão de preparadas.
- `nfse_queue_change_events` recebeu um evento às 21:35:11.237974 no polo, ambiente `PRODUCAO` e mês `2026-11` da operação. A tabela está publicada no `supabase_realtime`, com RLS e política `private.can_read_nfse_queue_event(polo_id)`.
- As RPCs de material e prova terminal são negadas a `anon` e `authenticated`, e concedidas somente a `service_role`. Os três papéis não possuem SELECT direto da tabela privada de operações. Eventos são legíveis por `authenticated` sob RLS.
- `DONE/INELIGIBLE` no job é esperado: a mudança fiscal terminal retira a operação da elegibilidade de reconciliação; não indica falha da autorização.


## Validação e limites

- Novo teste SQL reproduziu `2201B` com a função antiga e passou após a migration. Cobriu tokens de 1, 255, 256 e 4096 caracteres, além de recusar vazio, nulo, 4097, espaços, barra, quebra de linha e caracteres não permitidos. URL, chave, propriedades extras, role, lease e ACL continuam verificados.
- O teste SQL de material/prova existente passou a configurar um token sintético não vazio e passou novamente.
- Parser/transporte: 10 testes Deno focados passaram; produção existente: 6 testes passaram. Os negativos cobrem XML, identidade, aliases, ambiente e tentativa de POST no transporte somente leitura. Os dois entrypoints passaram em `deno check`.
- CI: o novo parser foi incluído na lista explícita de testes fiscais; o teste SQL é coberto pelo glob PGlite existente e por nova entrada `relay-token` na matriz PostgreSQL 17 do worker.
- A verificação real confirmou recuperação fiscal e emissão do evento. A apresentação autenticada na aplicação local permanece sob conferência do usuário; não houve smoke visual por navegador do agente.

## Manifesto explícito

Total: 17 arquivos

Nove arquivos de implementação/teste:

- `supabase/migrations/20261112224000_nfse_reconciliation_relay_token_validation.sql`
- `supabase/tests/nfse-reconciliation-relay-token.isolated.test.mjs`
- `supabase/tests/nfse-reconciliation-material-proof.isolated.test.mjs`
- `supabase/functions/_shared/nfse-national/production-json-identity.ts`
- `supabase/functions/_shared/nfse-national/production.ts`
- `supabase/functions/_shared/nfse-national/production-nfs-json-id.test.ts`
- `supabase/functions/_shared/nfse-national/production-post-identity.test.ts`
- `supabase/functions/nfse-reconciliation-worker/read-only-transport.ts`
- `supabase/functions/nfse-reconciliation-worker/read-only-transport.test.ts`

Integração e registro deste fechamento:

- `.github/workflows/nfse-regressions.yml`
- `.github/workflows/nfse-worker-security.yml`
- `ai/operacao/registros/alteracoes/2026-11-12-nfse-incidente-retorno-automatico-326.md`

Metadados desta publicação:

- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-07-versao-4-8-255.md`
- `internal/versioning/system-version.json`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

Este manifesto não inclui o lote paralelo de Serviços/BolePix/Caixa.
