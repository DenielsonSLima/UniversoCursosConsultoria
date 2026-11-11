# Descrição acadêmica da NFS-e

Contrato das novas preparações por recebimentos, introduzido pelas migrations
`20261111013732` a `20261111013752`. Não altera notas transmitidas, modelos
salvos, revisões históricas, pagamentos ou reservas anteriores.

## Origem canônica

- A seleção identifica **turma + aluno**. Cada recibo fornece a sua matrícula;
  não se escolhe a primeira matrícula cadastrada para o aluno.
- Curso e modalidade vêm do curso da turma selecionada, sem inferência por NBS,
  nome do parceiro ou texto do modelo.
- O número da matrícula usa `formatar_matricula_validacao` com o ID e a data
  reais do vínculo e o polo autorizado. Não se usa o login geral do aluno.
- Parcelas vêm de `contas_receber.parcela_numero` do título físico vinculado ao
  recibo. Matrícula/rematrícula usam `tipo_lancamento` estruturado. Não se
  extraem números da descrição livre do lançamento.
- Pagamento usa a data efetiva de cada recibo/componente, sem trocar pelo mês
  da competência, vencimento ou tela fiscal.

O snapshot versão 2 guarda `academic.descriptionContext.version = 1`, contendo
curso, turma e `entries[]` ordenadas por `receiptId`. Cada entrada conserva
recibo, título, matrícula, data/número da matrícula, parcela/tipo e pagamento.
O shape anterior de `financial.receipts` permanece preservado.

## Catálogo literal

| Variável | Valor na preparação acadêmica |
| --- | --- |
| `{{curso}}` | Nome real do curso da turma |
| `{{matricula}}` | Matrícula(s) dos vínculos dos recibos |
| `{{parcelas}}` | Parcela/taxa, mês de pagamento e matrícula quando houver mais de um vínculo |
| `{{meses_pagamento}}` | Meses efetivos dos pagamentos |
| `{{mes_referencia}}` | Compatibilidade: meses efetivos dos pagamentos |

O padrão formal é:

> REFERENTE AOS SERVIÇOS EDUCACIONAIS DO CURSO {{curso}}; MATRÍCULA(S): {{matricula}}; MENSALIDADE(S)/PARCELA(S): {{parcelas}}; PAGAMENTO(S) EFETUADO(S) EM {{meses_pagamento}}.

Não se acrescenta “Técnico” ou “EAD” ao nome que já veio do cadastro. Texto sem
variáveis acadêmicas conserva sua redação e recebe o padrão formal ao preparar
novos recebimentos. Quando o texto usa variáveis acadêmicas, deve incluir as
quatro informações. Expansão e validação são literais, sem expressões ou SQL.

Componentes do mesmo título/parcela/mês não repetem a parcela na descrição.
Listas mantêm ordem determinística pelo primeiro recibo correspondente. O
renderer suporta múltiplos meses; o seletor financeiro atual continua por mês
de recebimento, sem ampliação silenciosa de sua seleção.

## Validação e histórico

A descrição final deve ter até 2.000 caracteres, sem truncamento. Dados
estruturados ausentes ou expansão excessiva recusam a preparação inteira,
antes de persistir lote/reservas. A prévia do modelo mostra a **origem** dos
dados entre colchetes; não inventa aluno, matrícula ou parcela de exemplo.
A revisão fiscal e a ponte usam o contexto congelado para mostrar/transmitir
a mesma descrição. Mudanças posteriores nos vínculos, curso ou parcelas
invalidam a revisão antes de uma nova transmissão; não reescrevem o snapshot.

Preparações anteriores sem esse contexto exigem retirada lógica e nova
preparação pelos recebimentos, caso ainda não tenham sido transmitidas. A
revisão exibe `ACADEMIC_DESCRIPTION_CONTEXT_REQUIRED` e a ponte recusa nova
emissão. As guardas existentes impedem retirada após transmissão; tentativas
já enviadas continuam usando sua reconciliação e seus bytes persistidos.

**Serviços para parceiros:** a descrição literal confirmada na preparação é
preservada. Ser aluno não transforma a origem `PARTNER_SERVICE` em preparação
acadêmica, e não autoriza preencher curso/matrícula a partir do parceiro.
