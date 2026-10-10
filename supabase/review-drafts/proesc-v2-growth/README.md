> Estado em 10/10/2026: estrutura e vínculos validados; reaproveitamento ON sob
> autorização específica. FULL natural em acompanhamento. Storage segue somente
> preparado/testado com HTTP sintético. Ver [recibo e versões](./INSTALLATION.md).

O complemento [copy-only](./COPY-ONLY.md) prepara exportação V2 limitada e catálogo
privado, com prova HTTP simulada. Após cancelamento do RC.5, a reapresentação
foi autorizada como 4.8.197-rc.1 sobre main 971c0924, preservando o lote Banese.
O novo CI e qualquer instalação/transferência Storage continuam pendentes.

# Proesc V2: candidato de crescimento sustentável

Estado: instalação OFF e validação autorizadas concluídas em 09/10/2026.
Os quatro drafts preservam a revisão por fases. Os arquivos canônicos aplicados
são 20261009224423_prepare_proesc_v2_payload_storage_off.sql e
20261009224508_validate_proesc_v2_payload_constraints_off.sql.
A chave foi ativada sob autorização posterior em 10/10; não houve backfill, upload ou remoção.

Base consultada pelo MCP GitHub: `3886e6b0e12e45001f5a7bf2858965b4d8d4307d`,
main de DenielsonSLima/UniversoCursosConsultoria, reconferida em 09/10/2026.
O checkout de trabalho é um snapshot parcial do domínio, em branch local
`prepare/proesc-v2-growth`; seus commits locais não têm ancestralidade remota.
Ver `PREFLIGHT.md` para os achados do catálogo e a revisão RC.2.
A branch remota `review/proesc-v2-payload-20261009` parte do commit remoto
indicado, preservando o restante do repositório. O manifesto explícito do lote
lista código, testes, CI e registro da versão candidata. O lote ativo paralelo,
as políticas, os índices e as migrations antigas permanecem intactos.

## Etapa A: reduzir novas cópias pesadas

1. `01_payload_storage.draft.sql`: JSONB canônico imutável, identificado por
   unidade/invoice/versão/hash; FK composta e representação exclusiva entre
   JSON legado ou referência. Tabelas privadas, RLS ativa, sem grants de cliente.
2. `02_payload_readers.draft.sql`: adaptação dos quatro leitores financeiros
   conhecidos, com hashes exatos de fonte e preservação de ACL/metadata.
   O helper de evidência recompõe a forma legada para manter observationHash.
3. `03_payload_writer.draft.sql`: preserva o validador e sua chave por run;
   quando ativado, grava referência em vez de outra cópia do mesmo JSON.
   INSERT concorrente usa chave única, DO NOTHING e nova leitura; divergência
   de conteúdo com hash igual aborta, sem aceitar evidência incorreta.
4. `04_payload_activation_gate.draft.sql`: instala uma chave de ativação
   restrita ao operador de banco. Não a chama. Valida leitores, constraints,
   privilégios e RLS; espera o run corrente terminar. A mesma trava do runtime
   impede trocar o modo no meio do commit de página.

Todos os IDs, FKs, observações por run, páginas, horários, FULL/RECENT, snapshots
financeiros e sequência A→B→A continuam existentes. Somente o corpo repetido
é compartilhado. Dados anteriores não são reescritos nem copiados para a nova
tabela. O primeiro payload distinto gera uma linha e três índices; há benefício
quando o conteúdo se repete. Hashes nunca substituem a comparação JSONB exata.

O inventário bloqueia leitores não revisados em funções, procedures, funções
window, corpos SQL-standard, argumentos compostos, views/rules e triggers.
Isso complementa a revisão do código, não prova ausência de SQL dinâmico externo
ou acesso administrativo ad hoc. Qualquer leitor/exportador novo deve usar a
representação resolvida; a coluna física normalized pode ser NULL nas novas
observações, mesmo com evidência completa.

## Limites deliberados

- Observações leves continuam crescendo linearmente. Não é o fim do crescimento.
- Snapshots OPEN e observações de pessoas continuam com o comportamento atual.
  Evitar snapshots repetidos exige outra fase que preserve frescor e contagens
  da financial_observation_history; não foi incluída silenciosamente aqui.
- Não há mudança de frequência, gateway, valores, juros, baixa, emissão ou saldo.
- Não há limpeza nem liberação imediata do espaço já ocupado.
- Os 8 GB provisionados não equivalem a 8 GB ocupados e não diminuem com DELETE.

## Testes e medições

Node 24.19.0; PostgreSQL em WASM pelo PGlite 0.3.14 já instalado. A fixture usa
SHA256 nativo do PostgreSQL como adaptação da extensão pgcrypto indisponível
nesse runtime. Os corpos SQL dos leitores, runtime e aplicação financeira são
os da base indicada; autenticação, tabelas auxiliares e gatilhos externos são
fixtures sintéticas. Não se afirma smoke do Supabase/RBAC completo.

Suítes portáteis em `supabase/tests/proesc_v2_payload_*.isolated.test.mjs`:
armazenamento adversarial, runtime e paridade financeira, writer, catálogo/gates,
confirmação real de portal, composição e escala. Executar cada uma com Node.
A dependência de teste é `@electric-sql/pglite@0.3.14`; usar instalação isolada e
resolução pelo node_modules de teste, sem alterar dependências do produto.
Não incluir o symlink node_modules no pacote.

Resultados da primeira rodada representativa:
- Runtime: 64 verificações; mesmas contas, pagamentos, snapshots e evidências
  entre legado e modo canônico; replay, falha atômica e retorno a OFF.
- Composição: 26 verificações, com positivo e onze guardas negativas por modo.
- Portal: 24 grupos, incluindo manifesto preparado antes da mudança, replay,
  observação posterior igual/divergente e FULL ausente.
- Armazenamento: 15 grupos adversariais; writer: 7 grupos end-to-end.
- Arquivo local: 16 testes de criação/verificação/restauração e falhas.
- Escala sintética: 20 runs × 100 invoices = 2.000 observações nos dois modos,
  com o mesmo hash da evidência resolvida.
- JSONB de payload: 1.124.080 → 56.204 bytes, redução de 95%.
- Relações locais dessas duas tabelas, incluindo índices: 3.481.600 → 1.286.144
  bytes, redução de 63,1%. Não representa redução prevista do banco inteiro.
- Uma amostra fria: escrita aproximadamente 882 → 973 ms. O lookup/hash tem
  custo; a amostra não comprova ganho de latência e não serve como SLA.

O workflow `.github/workflows/proesc-v2-payload.yml` executa as dez suítes,
os 16 testes de arquivo e o ensaio PostgreSQL 17 nativo, com pgcrypto real.
Exige banco dedicado vazio em loopback; consulta pg_blocking_pids para provar
contenção entre backends e cobre commit, rollback e replay. A janela WAL é
registrada como volume do cenário isolado, sem alegar economia OFF/ON.
Actions são fixadas em SHA e a imagem versionada tem seu digest registrado.
Nenhum segredo ou ambiente de produção é disponibilizado ao job.

O workflow de qualidade completo faz checkout do head exato do PR e executa
linhas, contrato operacional, TypeScript, lint, testes e build. Os resultados de
CI pertencem ao SHA apresentado nos checks; execução local parcial não os
substitui. Todos os novos arquivos foram conferidos contra o teto de 500 linhas.
O relatório independente inicial preserva o estado anterior à execução de CI.
A suíte da migration compara seu conteúdo às quatro fases e prova rollback de
schema, funções/ACL e observações em falhas antes/depois de adaptar os leitores.
O PG17 nativo carrega o mesmo arquivo real e confirma a instalação OFF.

## Etapa B: arquivo recuperável, ainda local e inativo

`archive/` implementa JSONL/gzip, manifesto versionado, SHA-256, leitura de
retorno, limites de bytes/registros/descompressão, restore para destino separado,
retry idempotente e recusa de overwrite. Só aceita dados declaradamente
sintéticos e adapter filesystem; não há rede, SQL, upload ou cleanup habilitado.

A futura integração com Storage privado precisa de autorização do destino,
verificação da quota real e política de preservação dos objetos. A referência
comercial de 100 GB, se for Supabase Storage, é separada do disco PostgreSQL;
não significa saldo confirmado. Backups/PITR do banco não salvam os bytes dos
objetos, e exportação/restauração pode gerar egress cobrado. Ver README do módulo.

Antes de qualquer exclusão futura: seleção determinística de runs terminais;
proteger FULL de referência, execução em andamento, observação vigente,
snapshots/confirmacões/correções referenciados e fatos financeiros; publicar
manifesto somente após upload/readback e restauração comprovados. Revalidar
referências e elegibilidade no commit do lote. Janela financeira exige decisão
de negócio; nenhum prazo foi inventado. Não usar VACUUM FULL/TRUNCATE/REINDEX
como parte automática. Uma cópia noutra tabela não é arquivamento externo.

## Gates e reversão operacional

1. Revalidar main/catálogo e o manifesto. Publicação em branch e CI autorizada;
   confirmar SHA remoto e todos os checks antes de propor a próxima etapa.
2. Executar a suíte focada e o gate PostgreSQL 17 multi-backend/latência/WAL em
   ambiente descartável/CI. Investigar regressões; não ativar sem esse resultado.
3. Sob autorização específica de migração, aplicar o arquivo atômico versionado
   via fluxo MCP, mantendo flag false. Revalidar base/catálogo antes. Conferir
   advisors, grants, hashes e constraints. Validar as duas constraints NOT VALID
   em janela aprovada; não há backfill nesse passo.
4. Autorizar e chamar a chave ON somente com os gates satisfeitos e run ocioso.
   Acompanhar um FULL e um RECENT naturais: mesmas contagens/completude/resultados,
   p95/duração/erros, payloads novos/reusados, crescimento de índices/tabelas e WAL
   por janela. Não disparar FULL extra só para produzir uma medição.
5. Reversão comportamental: chave OFF. Novas gravações voltam ao formato legado;
   os leitores compatíveis e o conteúdo canônico permanecem. Não remover coluna,
   helpers ou tabelas, nem restaurar leitores antigos enquanto houver referências.
6. Storage real, seleção/integração de arquivo e remoção são autorizações e
   validações posteriores. O protótipo local não é uma retenção de produção.

Fontes técnicas: https://www.postgresql.org/docs/17/sql-insert.html ;
https://www.postgresql.org/docs/17/routine-vacuuming.html ;
https://supabase.com/docs/guides/platform/backups ;
https://supabase.com/docs/guides/platform/manage-your-usage/storage-size .
