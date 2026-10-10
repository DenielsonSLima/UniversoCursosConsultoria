# Revisão independente do armazenamento Proesc V2

Revisão concluída em 9 de outubro de 2026, às 22h02 UTC.

## Parecer

O pacote está apto a ser entregue como preparação local, com a nova escrita
desligada. Não há aprovação para aplicar migrations ou ativar a mudança em
produção. Os testes locais passaram; os gates nativos e de integração abaixo
ainda precisam ser cumpridos.

Esta fase compartilha somente o JSON normalizado repetido de uma invoice.
Mantém observações, IDs, runs, referências, snapshots financeiros e timestamps.
O reaproveitamento de snapshots OPEN foi retirado por alterar a leitura do
histórico e seu frescor. Não há backfill, retenção ou exclusão de dados antigos.

## Base e escopo verificados

- Base declarada e materializada pelo implementador: GitHub main
  `3886e6b0e12e45001f5a7bf2858965b4d8d4307d`.
- Snapshot Git local observado no fechamento:
  `338ea6c3ccc568bdb9d4c5ffa129b7b116d1ecbb`.
- Checkout parcial do domínio, sem confirmação de integração do repositório completo.
- Revisão dos quatro drafts SQL, dos leitores de payload e dos contratos financeiros.
- Execução em Node 24 e PGlite 0.3.14, com dados inteiramente sintéticos.
- Nenhuma consulta ou escrita em produção nesta etapa de preparação.
- Nenhum push, merge, deploy, emissão bancária ou limpeza de dados reais.

## Verificação independente executada

A última execução conjunta das quatro suítes portáteis terminou com quatro
arquivos aprovados e zero falhas, em aproximadamente 14,5 segundos.

1. `proesc_v2_payload_adversarial.isolated.test.mjs`: 15 grupos de armazenamento.
   Testou legado inline, hash de evidência legado, ordenação de chaves JSON,
   A para B para A, distinção entre null, zero, campo ausente e string,
   isolamento de unidade e invoice, FK composta, representação exclusiva,
   imutabilidade, referências inválidas, rollback sem órfãos, ACLs e colisão
   de hash simulada. Todos passaram.
2. `proesc_v2_payload_writer.isolated.test.mjs`: sete grupos de escrita e
   aplicação OPEN reais. Cobriu flag OFF, ON e OFF novamente, três observações
   e três snapshots para A para B para A, somente dois payloads compartilhados,
   timestamps preservados, rejeição de duplicata no mesmo run sem órfãos,
   replay da aplicação e recusa de observação antiga. Todos passaram.
3. `proesc_v2_payload_portal.isolated.test.mjs`: 24 grupos em três formas,
   legado, manifesto legado preparado antes da migration e conteúdo canônico.
   Executou a confirmação real de portal, conferiu pagamento e FK da observação,
   replay idempotente, observação posterior igual ou divergente, hash adulterado,
   ausência de prova FULL e ator inválido. Executou também o candidato de
   composição calculada em caminhos positivos e negativos. Paridade confirmada.
4. `proesc_v2_payload_reader_gate.isolated.test.mjs`: sete tipos de leitor não
   revisado bloquearam a instalação, incluindo outro schema, overload, view,
   SQL-standard body, procedure e trigger baseado em NEW.normalized.
   Após instalação, os casos de SQL body, overload, procedure e trigger também
   impediram ativação. O desligamento continuou disponível. Permissão indevida
   foi recusada; ausência do singleton deixou de produzir falso sucesso.

O ensaio offline de arquivo também foi revisado e seus 16 testes foram
executados com sucesso. Ele continua restrito a arquivos sintéticos locais,
sem cliente Storage, rede, banco ou autorização de retenção.

`git diff --check` não apontou problemas. Os quatro testes independentes têm
128, 103, 67 e 146 linhas, respectivamente, dentro do teto do repositório.

## Problemas encontrados e corrigidos durante a revisão

- O inventário inicial ignorava outros schemas e overloads de nomes conhecidos.
- SQL-standard bodies não apareciam no matcher baseado somente em prosrc.
- Procedures e triggers com NEW.normalized escapavam da primeira guarda.
- A função de ativação retornava sucesso mesmo sem linha singleton.
- O hash de portal precisava preservar a representação legada após a nova coluna.
- A comparação com observação posterior precisava resolver o payload canônico.

Os casos correspondentes agora fazem parte das regressões locais. Não restou
bloqueio conhecido para entregar este preparo desligado.

## Gates obrigatórios antes de instalação e ativação

1. Reconciliar o pacote com o checkout completo e a versão vigente do sistema.
   Confirmar todos os leitores, contratos, migrations aplicadas e hashes de drift.
2. Rodar a cadeia em PostgreSQL 17 nativo isolado, com pgcrypto real e o schema,
   triggers e políticas de acesso completos. As fixtures não provam RBAC completo.
3. Testar duas sessões concorrentes para payload igual e diferente, rollback de
   escritor, conflito no mesmo run, níveis de isolamento e alternância da flag
   junto ao lock do runtime. PGlite usa um backend e não comprova esses cenários.
4. Medir latência, planos, locks, WAL e tamanho físico com distribuição realista,
   inclusive baixa repetição de payloads. Economia em fixtures não é previsão de
   disco, de cobrança ou de I/O da produção.
5. Definir uma janela aprovada para os locks de DDL e validação das constraints
   NOT VALID. Não disparar validação ou scans históricos a cada execução do cron.
6. Obter autorização explícita para a implantação e, separadamente, para ativar.
   A alteração deve começar OFF e preservar a reversão por OFF com leitores
   compatíveis. Desligar não remove payloads já referenciados.

O pacote não recupera imediatamente o espaço ocupado pelos registros antigos e
não reduz automaticamente o disco provisionado de 8 GB.

## Reprodução

Na raiz do pacote, com a dependência de teste PGlite 0.3.14 disponível:

```sh
node --test --test-concurrency=1 \
  supabase/tests/proesc_v2_payload_adversarial.isolated.test.mjs \
  supabase/tests/proesc_v2_payload_writer.isolated.test.mjs \
  supabase/tests/proesc_v2_payload_reader_gate.isolated.test.mjs \
  supabase/tests/proesc_v2_payload_portal.isolated.test.mjs
```

## Identidade dos drafts revisados

SHA-256:

- `01_payload_storage.draft.sql`:
  `63afe9468d7b0578eb91f23d0556f0d1c73cf5b27da56af80be53f0e4bcf9649`
- `02_payload_readers.draft.sql`:
  `7c078be10074ea06c4de13fece9c8ddfc20cea344529800b8b72cd435935bedb`
- `03_payload_writer.draft.sql`:
  `90e0915722ef18a57864e28b85625e55e3aa3778020f4bc982185b19c7d1c09e`
- `04_payload_activation_gate.draft.sql`:
  `945b3e9efd5620e023a91d2eafaf23b4447c8c2f4ca8546e42594319cdd56c80`

Qualquer alteração posterior exige revalidar as verificações afetadas.

## Complemento copy-only em 10/10/2026

Revisão independente da preparação local: 80/80 testes de arquivo/HTTP, 10 grupos
adversariais do catálogo e 7 verificações integradas SQL→HTTP mock→recibo→restore
passaram. Autorização, escopo, precisão financeira, drift, rollback atômico e
imutabilidade foram conferidos. O novo helper usa inventário por hash exato.
Não há bloqueio local restante conhecido; PostgreSQL nativo/concorrência do novo
candidato e checks do head ainda precisam ser confirmados. Não é homologação do
Storage real nem autorização de instalação, grants, upload, remoção ou merge.
