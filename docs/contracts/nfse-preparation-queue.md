# NFS-e — preparação acadêmica e fila

Status: backend aplicado e validado em 08/11/2026; interface no candidato de publicação 4.8.273.
Não habilita emissão, não gera numeração DPS e não modifica pagamentos ou cobranças.

## Preparar

`prepare_nfse_batch_secure(p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,
p_request_id uuid,p_candidate_ids text[],p_model_id uuid,p_model_version integer,p_payment_month text)`.

- Contexto/polo/ambiente/mês são reautorizados pelo servidor antes do replay.
- `p_candidate_ids` contém até 1.000 identidades `turma:aluno`, sem duplicatas.
- `p_payment_month` é o mês dos recebimentos; `p_month` é o mês da fila. Nenhum deles
  define automaticamente competência fiscal ou data da prestação.
- O cliente não fornece valor, CNPJ emitente, destinatário fiscal ou dados de pagamento.
- O modelo deve estar ativo, na versão esperada e no mesmo polo/ambiente.
- O backend resolve os recebimentos efetivos do Caixa e conserva a origem física do título,
  evento/componente, matrícula, data, valor e forma/origem de pagamento.

Cada operação cria um lote, documentos por aluno/turma e reservas dos recebimentos em tabelas
privadas com RLS e acesso direto negado. Snapshot e reservas não podem ser atualizados nem
apagados. O snapshot contém cadastro próprio do estabelecimento, candidato a tomador e modelo
versionado. A confirmação do tomador, competência e data da prestação continuam obrigatórias.
Dados cadastrais de filial não são preenchidos por empréstimo dos dados da matriz.

Locks por requisição e polo/ambiente serializam a preparação. Os títulos físicos são bloqueados
antes dos eventos, na ordem canônica, e a seleção é relida em READ COMMITTED. A comparação
final com a RPC de seleção usada pela tela impede preparar um total menor silenciosamente.
Uma divergência rejeita todo o lote com `40001`; uma sobreposição reservada rejeita com `23505`.
Não há salvamento parcial dos alunos válidos de um lote inválido.

Repetir o mesmo usuário/requestId retorna a resposta anterior apenas se todo o payload canônico
coincidir e a autorização ainda existir. O frontend conserva o requestId após falha/resposta
perdida, encerrando a tentativa somente depois de uma resposta confirmada. Uma nova preparação
após sucesso recebe outro requestId. Não há retry automático de mutações.

## Ler a fila

`get_nfse_queue_secure(p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,
p_status text DEFAULT 'PREPARADO',p_page integer DEFAULT 1,p_page_size integer DEFAULT 25)`.

Envelope v1 e scope padrão. `data` contém `rows`, `page`, `pageSize`, `totalItems`, `totalAmount`,
`summary:{preparedCount,preparedAmount}` e `providerEnabled:false`. Valores são strings
decimais exatas de NUMERIC(30,2); a interface não soma nem converte para Number.

Cada linha projeta apenas identificação da preparação, nome/turma, modelo, valor, contagem,
mês dos recebimentos e motivos de bloqueio. O snapshot completo e dados fiscais privados
não são devolvidos na lista. Cache por contexto/polo/ambiente/mês; mutações invalidam o escopo
capturado no início e a seleção do mês dos recebimentos. Foco/atualização manual revalidam
a lista; esta entrega não cria publicação Realtime de tabelas privadas.

## Limites que permanecem

- A seleção atual mostra todos os recebimentos do candidato no mês. Se parte já estiver
  reservada, uma nova preparação é bloqueada integralmente, inclusive após pagamento novo,
  até existir seleção por ambiente que mostre somente os recebimentos disponíveis.
- Uma preparação não impede estorno financeiro posterior. A origem precisa ser revalidada
  antes de futura transmissão; reserva fiscal nunca autoriza alterar pagamento.
- A fila imutável ainda não é o ledger de documentos autorizados/tentativas/eventos fiscais.
  Competência, tomador legal e dados fiscais confirmados precisam de contrato próprio antes
  de formar uma DPS final; cadastro do aluno não prova quem é o tomador.
- A confirmação remota do novo contrato, contenção entre sessões PostgreSQL e homologação
  com certificado real dependem da etapa operacional correspondente.

## Cancelamento de notas emitidas

O cancelamento pertence à nota autorizada e aos seus eventos, nunca à exclusão desta fila.
Os contratos nacionais locais distinguem cancelamento direto 101101, solicitação de análise
101103 e substituição por nova DPS. Solicitação aceita permanece aguardando análise; só
eventos fiscais confirmados alteram o estado da nota. Prazo/teto e demais condições vêm
da parametrização municipal vigente, com confirmação de identidade/ambiente e eventos.
Não se libera ação de cancelamento por uma data calculada no navegador ou por XML importado.
Ver [provider e fontes oficiais](../../supabase/functions/_shared/nfse-national/README.md).
