# Piloto Storage V2: recibo agregado de execução

Data: 10/10/2026. Execução autorizada separadamente da preparação de código.
Fonte implantada: commit `0bd7eb9c386ca0290e0a088bec7d31f0cb1346e8`,
que passou dez workflows, PostgreSQL 17.6 e Deno 2.1.4/2.9.1.

Este registro não contém o payload, identificadores de alunos, observações,
links, snapshots, nomes de objetos reais ou valores de credenciais.
O recibo individual e a seleção exata ficam no catálogo privado do projeto.

## Instalação conciliada

- Projeto: `kfekgwyqozhicpfuunpo`.
- Migration aplicada: `20261010112854_prepare_proesc_v2_copy_only_catalog`.
- Arquivo canônico: `supabase/migrations/20261010112854_prepare_proesc_v2_copy_only_catalog.sql`.
- SHA-256: `eae553eec2a5c91af98c9ba223fbcdf89bfbe1a3d2b141702aea34c1a1c0887f`.
- Os bytes são exatamente os do draft 05 revisado, inclusive seu comentário de
  preparação original. Não reaplicar o draft sob outro nome nem editar a migration.
- Duas tabelas privadas, RLS ativa, acesso direto apenas postgres.
- EXECUTE de duas RPCs novas apenas postgres/service_role, com guarda interna,
  SECURITY DEFINER e search_path vazio. Nenhuma nova credencial foi criada.
- Inventário de leitores atualizado na mesma transação; o reaproveitamento de
  payload continuou ON. As duas migrations anteriores permanecem imutáveis.

## Serviço e única invocação

- Edge Function `proesc-v2-copy-archive`, versão 1, ACTIVE.
- Os nove arquivos recuperados após o deploy coincidiram byte a byte com a fonte
  aprovada. Autenticação interna via authorizer V2; verify_jwt=false só nessa rota.
- Bundle retornado pelo deploy, SHA-256:
  `665cd6504e1a618cca05489159f430106e959eefbd8d37b0450a06125703214a`.
- Uma chamada pg_net usando o segredo já existente dentro do servidor; nenhum
  valor de segredo foi retornado. Sem retry, novo cron ou lote adicional.
- Resposta: HTTP 200, COPY_RECEIPT_RECORDED, restoreVerified=true; sem timeout.
- Recibo gravado às 11:30:39 UTC.

## Resultado e invariantes

Uma observação de um RECENT COMPLETE foi copiada para o bucket privado existente
`proesc-history`. Texto original: 1.582 bytes. Arquivo gzip: 843 bytes. Manifesto
gzip: 405 bytes. O recibo vincula hashes, tamanho, quantidade e destino.

O handler conferiu o upload, releu os dois objetos e reconstituiu em memória os
bytes exatos antes de gravar o recibo. Hashes da observação, do normalized resolvido
e do snapshot financeiro permaneceram iguais ao baseline. A origem ficou no banco;
nenhuma alteração de pagamento, exclusão ou desreferenciamento foi executada.

A revisão independente de 11:32:58 UTC passou 13 verificações de metadados/ACL/RLS,
existência e hashes da fonte, dois objetos, tamanhos e recibo/resultado HTTP,
sem ler o conteúdo pessoal. Os nove módulos também coincidiram com o revisado.
A evidência de restauração vem da execução do handler revisado sobre os bytes
relidos; não é restauração em outro ambiente nem um teste de desastre.

Copiar este registro não libera espaço SQL. Backup/PITR do banco não inclui os
bytes Storage. Lotes maiores, retenção e remoção continuam fora da autorização
deste piloto. O FULL natural da fase de payload permanece em acompanhamento.
