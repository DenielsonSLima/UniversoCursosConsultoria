# Referência histórica — não orientar novas consultas

Arquivado em 01/10/2026. A escolha operacional agora é V2; leia [contrato vigente](../v2-operacional.md). O texto abaixo preserva diagnósticos e decisões anteriores, sem afirmar o estado atual de produção.

# Conciliação do legado Proesc da T42

Procedimento para conferir e preparar a sincronização do primeiro ciclo importado, preservando o segundo ciclo Banese. Este documento descreve requisitos e verificações; não declara uma sincronização financeira implementada ou ativa.

## Escopo e fotografia do diagnóstico

Em **12 de setembro de 2026**, o diagnóstico da sessão registrou **35 matrículas, 340 parcelas do legado e 78 títulos Banese** na T42. São contagens históricas para comparação, não limites fixos nem critérios de seleção. Recontar antes de cada execução.

- Turma: `ENF-T42-INT-MAT`.
- Primeiro ciclo: histórico financeiro importado do sistema anterior, candidato à vinculação com Proesc.
- Segundo ciclo: títulos gerados no Universo/Banese; não são administrados pela sincronização Proesc.
- A regra de dois ciclos permite geração manual do segundo ciclo, mantendo bloqueios acadêmicos e proteção contra ciclo já gerado. Conferir essa regra separadamente da cobrança do legado.
- Trancamento não significa pagamento ou cancelamento automático de dívida. Não alterar a matrícula durante uma conferência financeira.
- Radiologia é outro escopo; não incluir seus títulos na operação T42.

O código de origem `T42-LEG-...` é uma referência local de importação, **não um identificador de parcela fornecido pela API Proesc**.

## Seleção local comprovada pelo código

A projeção interna `history_t42`, na migration `20260912150751_proesc_readonly_workspace.sql`, seleciona matrículas da turma acima e parcelas com todas estas condições:

```sql
c.matricula_id = m.id
and c.origem_pagamento = 'SISTEMA_ANTERIOR'
and c.origem_cronograma_id ~
  '^T42-LEG-S[0-9]+-P[0-9]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$'
and c.gateway_provider is null
```

Esse filtro identifica candidatos locais. Ele não prova que uma parcela externa corresponde à candidata, nem que qualquer registro `SISTEMA_ANTERIOR` veio do Proesc. Não ampliar o filtro silenciosamente.

A importação histórica protege repetição pelo par **matrícula local + origem do cronograma**. Não assumir que `origem_cronograma_id`, isoladamente, é único: a mesma referência pode aparecer em matrículas distintas. Preservar também o ID local do recebível.

## O que a documentação V1 oferece

| Recurso | Campos e filtros documentados | Limitações para conciliar |
| --- | --- | --- |
| `GET /financial_statement` | Filtros `ano_letivo` e `unidade_id`; `student_id`, vencimento, emissão, data de pagamento, tipo de débito, valor bruto e nível/curso acadêmico. | Não documenta ID único da parcela, ID da matrícula, situação financeira, valor efetivamente pago, saldo residual ou vínculo de substituição/negociação. |
| `GET /general_student_list` | Filtro `ano_letivo`; pessoa, matrícula, RA, nome da turma e etapa, além de dados cadastrais. | Não documenta status da matrícula, data de trancamento ou histórico de alterações. O nome da turma não substitui sua identidade comprovada. |
| `GET /list_students_filter` | `unidades` obrigatório, `ano_letivo`; `person_id`, `identification` (CPF), `id_class`, `class`, `active`, `nonperforming` e `updated_at`. | Recurso de controle de acesso/catraca. `active` não é comprovação de trancamento; `updated_at` se refere à pessoa, não ao evento acadêmico. |
| `GET /accounting_data` | Unidade, ano e mês obrigatórios; filtros opcionais de dia, chave, bloco e pagamento. Retorna `chave_id`, `id`, `valor`, datas, forma de pagamento e dados contábeis. | `chave_id` é descrito como chave única; sua relação com a obrigação deve ser provada. **`id` identifica o bloco, não a parcela.** `valor` é o valor daquele registro, não necessariamente o total recebido. |

No extrato financeiro, a descrição de `ano_letivo` o define como **ano de vencimento das parcelas**, apesar do nome do parâmetro. Na lista acadêmica, significa ano letivo. Não tratar os dois filtros como equivalentes.

O schema V1 do extrato não documenta paginação nem filtro de alteração incremental. Verificar completude e comportamento real; não transportar automaticamente o contrato paginado da V2 para esse endpoint.

V1 documenta credencial em parâmetro de consulta. Não registrar URL autenticada, comando completo, token ou resposta pessoal em logs, histórico de ferramentas, testes ou documentos. A chamada deve usar o mecanismo protegido da integração, conforme o contrato operacional vigente.

Os testes reais e suas contagens estão no [diagnóstico de 12/09/2026](../diagnostico-2026-09-12.md): configuração, cadastro por exercício e contabilidade responderam com sucesso. O extrato `financial_statement` continua sem resposta válida. Sucesso de um recurso não comprova o acesso aos demais nem valida uma baixa.

Não considerar a simples presença de data de pagamento como prova suficiente do valor recebido. `installment_gross_value` representa valor bruto da parcela; não documenta quanto foi efetivamente pago. Os campos de valor pago da documentação V2 não podem ser presumidos na V1.

### Composição contábil não é lista de parcelas

Em `accounting_data`, a documentação distingue `chave_id` (chave única) de `id` (bloco). Os exemplos de blocos incluem **1 Receita, 2 Juros, 3 Multa, 4 Honorários e 5 Cancelamento**, além de blocos de desconto. Não gravar `id` como identificador de uma parcela Proesc: vários registros podem compartilhar o mesmo tipo de bloco.

**Os exemplos não são o mapeamento validado desta instituição.** A [conferência real](../conferencia-t42-2026-09-12.md) encontrou recebimentos compatíveis no bloco 2 e registros cancelados com bloco 6. Verificar essa evidência antes de interpretar valores; a ausência de data no principal não indica ausência de pagamento.

O parâmetro de filtro se chama `id_chave`, enquanto o campo de resposta é `chave_id`. Validar essa diferença e a cardinalidade real entre chave, bloco, obrigação, aluno e matrícula; o nome “chave única” não comprova que a chave seja um ID de parcela.

Antes de calcular uma baixa a partir desses dados, provar o contrato de composição: quais registros formam principal, encargos, descontos e cancelamentos; seus sinais; a data efetiva; a forma de pagamento; e como registros substitutos ou repetidos são identificados. Não somar todos os `valor`, tomar o primeiro bloco nem contabilizar cancelamento como receita. A agregação pertence ao backend e depende de exemplos reais conciliados com o Proesc.

## Etapas da conferência

1. **Delimitar o conjunto.** Resolver turma e unidade corretas; contar matrículas, candidatos locais e títulos Banese excluídos. Separar contagens de ativos/trancados sem publicar nomes ou identificadores pessoais.
2. **Registrar a origem da leitura.** Guardar internamente versão da API, recurso, unidade, período, instante da consulta, revisão da credencial e evidência de completude. Na documentação, registrar apenas diagnóstico agregado e sem credenciais.
3. **Validar pessoas e matrículas.** Confirmar a correspondência entre `student_id` do extrato, `pessoa_id` da lista acadêmica e `person_id` de `list_students_filter`. Usar `id_class` quando comprovado e resolver pessoa, matrícula, turma e exercício; uma pessoa pode ter várias matrículas. `identification` auxilia conferência de CPF, mas não identifica matrícula ou obrigação isoladamente.
4. **Construir uma prévia de correspondências.** Comparar a obrigação externa com a parcela local selecionada. Nome, CPF, vencimento, valor e número da parcela podem ajudar a revisar, mas não constituem identidade suficiente isoladamente.
5. **Tratar ambiguidades.** Mais de um candidato, identificador ausente, referência repetida, aluno com múltiplas matrículas ou parcela substituta sem vínculo comprovado ficam pendentes de revisão. Não resolver pelo primeiro resultado nem por aproximação silenciosa.
6. **Fixar o vínculo externo.** Para sincronização automática, exigir identidade estável da obrigação no Proesc, com unidade/entidade quando necessárias. Em `accounting_data`, comprovar a relação de `chave_id` com essa identidade; nunca usar o `id` de bloco como parcela. Se o retorno V1 permanecer sem identificador adequado, solicitar contrato complementar ao Proesc ou manter somente conferência assistida; não inventar uma chave a partir de vencimento e valor.
7. **Simular o resultado.** Produzir totais de correspondentes, não encontrados, ambíguos e alterações propostas, separando situação, valor e data. Exibir a proveniência Proesc e preservar o ciclo Banese.
8. **Validar e registrar o aceite.** Conferir exemplos de aberto, pago, parcial e negociação/cancelamento. Respeitar a autorização existente; confirmar os critérios da transformação financeira e pedir informação adicional somente se faltar decisão material para resolver uma ambiguidade.
9. **Aplicar pelo contrato financeiro autorizado.** Somente após validar identidade, completude e pagamento, usar backend/RPC com autorização, idempotência e auditoria. Não calcular baixa ou saldo no frontend.
10. **Reconciliar e monitorar.** Recontar o conjunto, conferir preservação de Banese/matrículas, registrar resultado por turma e manter exceções acessíveis. Repetição sem mudança na origem não pode criar nova parcela, baixa ou evento financeiro duplicado.

## Situações financeiras e acadêmicas

| Situação observada | Tratamento exigido |
| --- | --- |
| Pago com identidade, valor efetivo e data comprovados | Candidato à baixa pelo backend após correspondência validada. |
| Data de pagamento, mas sem valor efetivo documentado | Conferência pendente; não copiar o valor bruto como valor pago. |
| Pagamento parcial | Identificar valor recebido e obrigação residual. O Proesc pode criar outra parcela para o saldo; não duplicar a dívida original. |
| Negociação | Provar relação entre obrigações substituídas e novo débito. Sem essa relação, revisão manual. |
| Cancelamento, estorno ou reabertura | Exigir evidência explícita; desaparecimento da listagem não comprova cancelamento. Não desfazer pagamento automaticamente por ausência. |
| Mudança de vencimento ou valor | Não criar nova obrigação apenas porque a combinação de campos mudou. Conferir o identificador externo. |
| Aluno trancado | Preservar bloqueio de nova geração aplicável; não inferir baixa, cancelamento ou data do trancamento pela situação financeira. |
| Falha HTTP, resposta inesperada ou leitura incompleta | Suspender aquela atualização; manter último estado confirmado e indicar a pendência. |

A documentação V1 consultada não comprova detecção automática de trancamento nem suas datas. Isso permanece verdadeiro mesmo quando `list_students_filter` devolve `active`: a descrição é apenas “Ativo”, sem contrato de estado acadêmico. Seu `updated_at` é a atualização do registro da pessoa, não uma data de trancamento. Uma ausência na lista de alunos também pode resultar de filtro, permissão, exercício ou incompletude.

## Idempotência e simulação sem exposição pessoal

- O identificador de execução deve acompanhar um payload imutável com escopo, versão do contrato e revisão da origem. Reutilização do identificador com outro payload deve falhar.
- Diferenciar repetição de uma leitura de uma mudança efetiva no pagamento. Preservar a evidência anterior e seu vínculo; não usar o horário da sincronização como data do pagamento.
- Autorizar antes de consultar resultados de execuções anteriores. Não retornar dados de outra unidade ao reconhecer um identificador repetido.
- Criar impressão determinística do conjunto protegido, ordenando pelos IDs internos no banco e comparando os registros antes/depois. Para simulação sem mutações, comparar também o legado candidato.
- Em teste transacional, terminar com `ROLLBACK`; comparar hashes de recebíveis Banese, matrículas, turmas e registros de ciclos manuais, conforme o teste de preservação já usado no projeto.
- Manter hashes completos e detalhes de correspondência apenas na execução protegida. No relatório versionado, guardar o resultado da comparação, contagens e condições de aceite. Hash de CPF ou nome não deve ser tratado como dado anônimo publicável.
- Fixtures devem ser inteiramente sintéticas. Não copiar payloads de alunos, credenciais, IDs reais, telefones, documentos ou dados bancários para arquivos de teste.
- A Conta Proesc representa controle da integração. Sua existência não comprova recebimento, saldo disponível ou vinculação das parcelas; não presumir saldo inicial.

## Evidências e fontes

- [Política financeira](../../../../politicas/FINANCEIRO.md): cálculo no backend, autorização, idempotência e auditoria de mutações.
- [Importação original do legado](../../../../../../supabase/migrations/20260827163000_import_turma_42_legacy_financial_history.sql): comparação de matrícula + origem do cronograma. O arquivo contém dados importados; consultar somente os trechos SQL necessários, sem imprimir seu payload massivo.
- [Regra manual do segundo ciclo e preservação](../../../../../../supabase/migrations/20260912140336_allow_t42_imported_history_manual_cycle2.sql): bloqueios acadêmicos, proteção contra duplicação e comparação transacional de hashes.
- [Projeção interna do legado](../../../../../../supabase/migrations/20260912150751_proesc_readonly_workspace.sql): filtro exato dos candidatos T42. Sua presença não significa que a ação continua pública na Edge.
- [Extrato financeiro V1](https://proesc.readme.io/v1.0/reference/financial_statement): schema público consultado em 12/09/2026.
- [Lista acadêmica V1](https://proesc.readme.io/v1.0/reference/general_student_list): schema público consultado em 12/09/2026.
- [Lista para controle de acesso V1](https://proesc.readme.io/v1.0/reference/list_students_filter): identidades de pessoa/turma, CPF e flags sem semântica comprovada de trancamento.
- [Dados contábeis V1](https://proesc.readme.io/v1.0/reference/accounting_data): `chave_id`, blocos contábeis e composição de valores a validar.
- [Pagamento parcial no Proesc](https://suporte.proesc.com/hc/pt-br/articles/17677179896087-Como-registrar-um-pagamento-parcial): criação de parcela pelo saldo restante.
- [Negociação no Proesc](https://suporte.proesc.com/hc/pt-br/articles/360006938934-Como-negociar-parcelas-no-Proesc): substituição por novo débito de negociação.

Os comportamentos da interface Proesc explicam os casos que precisam de teste; não comprovam que todos os respectivos campos e vínculos são devolvidos pela API.
