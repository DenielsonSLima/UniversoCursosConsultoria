# Instalação autorizada e validação OFF

Operação concluída em 09/10/2026, entre 22h44 e 22h46 UTC, no projeto Universo
kfekgwyqozhicpfuunpo, exclusivamente pelo MCP Supabase. A autorização específica
abrangeu instalação desligada e validação dos vínculos. Não incluiu ON, merge,
Storage ou exclusão. Nenhuma função de mutação financeira foi chamada.

## Origem e conciliação canônica

- Commit aprovado/testado: 34475f434e5ffce7f70ac1dbc9f729cfb7964c31.
- Arquivo preparado naquele commit:
  supabase/migrations/20261009223000_prepare_proesc_v2_payload_storage_off.sql.
- Registro atribuído pelo MCP: 20261009224423_prepare_proesc_v2_payload_storage_off.
- Caminho canônico após conciliação:
  supabase/migrations/20261009224423_prepare_proesc_v2_payload_storage_off.sql.
- SHA256 dos bytes, preservados integralmente:
  3b6cf3bb72d093027838ae5b422750c87deb22e2d7b4ebaa5912c3dcb764b84e.
- Validação registrada e versionada:
  supabase/migrations/20261009224508_validate_proesc_v2_payload_constraints_off.sql.
- SHA256 da validação aplicada:
  c2b537c9bf85683274e51e0492fc43a37b464016edbe8f835bb89786114d15de.

A mudança do nome do arquivo alinha o repositório à versão realmente aplicada;
o nome preparado permanece no histórico Git e neste recibo. Não há duas cópias
canônicas da mesma instalação. Não foi reparado, apagado nem reexecutado nenhum
registro remoto. Os dois SQLs aplicados são imutáveis a partir desta operação.

## Guardas e resultado

Preflight repetido antes da escrita: 1.288 migrations, onze leitores conhecidos,
sem instalação parcial ou locks externos nas relações verificadas. Todos os hashes,
RLS/ACL, índices e triggers correspondiam ao ensaio revisado.

A instalação usou transação única, lock_timeout 3s e statement_timeout 15s.
O MCP retornou sucesso; catálogo e registro remoto foram lidos em seguida.
A validação usou outra transação, lock_timeout 3s e statement_timeout 120s;
travou a linha de controle FOR SHARE, exigiu OFF e verificou os leitores antes
de validar FK/XOR. Não chamou o setter nem fez backfill. Não houve retry/timeout.

Pós-estado confirmado por leitura independente às 22h46min12s UTC:

- enabled=false; tabela de payloads vazia.
- v2_invoice_payload_identity_fk e v2_invoice_one_payload validadas.
- Dez constraints antigas e cinco índices de observações preservados.
- Dezessete hashes esperados; metadados/ACL das onze funções anteriores intactos.
- Três triggers de snapshots preservados; tabelas novas privadas, RLS ativa.
- 1.290 migrations, incluindo os dois registros acima.

Não houve chamada ON, limpeza, backfill, upload, alteração do cron ou merge.
OFF mantém as gravações no formato legado; a economia ainda não foi ativada.

## Evidência e limites

O SHA de origem passou nove workflows, incluindo PostgreSQL 17.6, pgcrypto real,
35 verificações da migration e 17 verificações nativas. A validação separada
passou nove verificações locais, incluindo recusa de ON, singleton ausente e
reader drift, com rollback. O CI do recibo executa os dois arquivos canônicos.

Isso não mede a economia de WAL/IO de produção nem reproduz integralmente todos
os triggers de contas_receber e os helpers de autorização. Nenhum registro de
aluno ou payload financeiro foi exportado para este recibo ou para o GitHub.

## Próxima decisão

ON continua exigindo autorização específica. A chave é global; o setter recusa
run RUNNING, drift, vínculos não validados ou grants inesperados. Usar o lock do
runtime e verificar leitura posterior; não habilitar por UPDATE direto.

Acompanhar RECENT e FULL naturais, sem criar FULL extra, verificando erros,
completude, continuidade de evidência e reutilização dos payloads novos.
Uma entrada idêntica deve manter a observação e reusar seu payload; mudanças reais
continuam rastreáveis. Crescimento leve de observações, snapshots OPEN e pessoas
permanece. Bytes de tabelas/WAL por janela são globais, não economia causal por run.

Reversão: OFF pelo setter, preservando leitores e referências canônicas.
Se houver falha de evidência, drift, erro recorrente ou latência incompatível,
interromper a ativação/voltar OFF conforme autorização específica da etapa ON.
Não remover helpers, colunas ou dados já referenciados como forma de rollback.
