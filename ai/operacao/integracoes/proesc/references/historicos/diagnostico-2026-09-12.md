# Referência histórica — não orientar novas consultas

Arquivado em 01/10/2026. A escolha operacional agora é V2; leia [contrato vigente](../v2-operacional.md). O texto abaixo preserva diagnósticos e decisões anteriores, sem afirmar o estado atual de produção.

# Diagnóstico Proesc em 12/09/2026

Resultados observados nesta sessão; não são promessa de disponibilidade futura. Horários abaixo em Brasília (UTC−3). Nenhuma credencial ou resposta pessoal foi persistida neste material.

Este documento descreve os testes iniciais. A leitura posterior de 48 meses e a comparação com o legado estão na [conferência ampliada](../conferencia-t42-2026-09-12.md).

## Configuração da instituição

- Usuário confirmou uma única unidade Proesc, correspondente à matriz principal da Universo.
- A API retornou uma unidade, identificada como UNIVERSO CURSOS E CONSULTORIA. Os polos locais do Universo não são unidades adicionais do Proesc.
- O token JWT salvo no sistema permaneceu intacto. A chave geral V1 fornecida pelo usuário foi usada em memória, apenas para testes GET nos hosts oficiais.
- Produção continua 4.8.44. O teste publicado em `proesc-api` v3 utiliza contrato V2; este diagnóstico não adicionou suporte V1 ao produto nem ativou cron.

## Leituras realizadas

| Contrato/recurso | Escopo | Resultado observado |
| --- | --- | --- |
| V2 `people` e `invoices`, chave geral V1 enviada em Bearer | Primeira página; invoices setembro/2026 | Às 13:10, ambos HTTP 403, HTML de 118 bytes, `awselb/2.0`; sem dados. Não prova invalidade da chave em V1. |
| V1 `configuration_data`, token na query | Entidade autorizada | Às 13:12, HTTP 200/JSON; uma unidade, nove exercícios, 521 categorias. |
| V1 `configuration_data`, controle sem token | Sem credencial | Às 13:15, HTTP 401/JSON, `status: error`. Comparado com a leitura autenticada, confirma acesso dependente da credencial nesse recurso. |
| V1 `general_student_list` | Ano letivo 2026, sem unidade | HTTP 200 com `status: error`, `description: unit id required`. É erro lógico, não lista vazia. |
| V1 `financial_statement` | Vencimentos 2026, sem e com unidade | HTTP 302 para `/erro`; redirecionamento não seguido. Esse extrato não foi validado. |
| V1 `list_students_filter` | Única unidade, ano letivo 2026 | HTTP 200, `status: success`, coleção `students` com 173 registros; nenhum com rótulo T42 nessa leitura. |
| V1 `list_students_filter` | Única unidade, ano letivo 2025 | Às 13:23, HTTP 200, `status: success`; 165 registros, dos quais 27 pessoas distintas com turma `ENF T-42 INT`. |
| V1 `accounting_data` | Única unidade, vencimentos setembro/2026 | HTTP 200, `status: success`, coleção `data` com 1.005 linhas contábeis. |

O JWT previamente salvo recebeu 403 em testes separados pelo banco e runtime Edge. Os testes desta tabela usaram a chave V1 fornecida depois pelo usuário. São credenciais e contratos distintos; o sucesso V1 não explica sozinho a recusa V2.

## Resultado preliminar da T42

- Cadastro 2025: 27 pessoas distintas, com `person_id`, `identification`, `id_class` e `active` presentes. A consulta 2026 não substitui a de 2025 para essa turma.
- Contabilidade setembro/2026: 202 linhas com rótulo `ENF T-42 INT`, 55 valores distintos de `chave_id`, envolvendo 33 CPFs distintos.
- Cruzamento preliminar de CPF com os 27 cadastros retornados em 2025: 169 linhas contábeis, 44 chaves e 26 pessoas. Essa contagem não comprova vínculo com cada recebível local nem exclui matrículas múltiplas.
- Fotografia local anterior: 35 matrículas, 340 parcelas legadas e 78 títulos Banese. As diferenças entre 27 cadastros, 33 pessoas no financeiro e 35 matrículas locais precisam de análise individual, sem inferir trancamento, cancelamento ou exclusão.
- **202 linhas contábeis não são 202 boletos.** `id` é bloco contábil; principal, juros, descontos e outros componentes podem compartilhar a chave. Tampouco as 55 chaves já foram comprovadas como 55 parcelas importáveis.

Este diagnóstico cobre um mês financeiro e dois exercícios acadêmicos, não todo o histórico da turma. Nenhuma comparação integral de valores/pagamentos, importação, vinculação, baixa ou sincronização automática foi concluída.

## Contrato real observado

- `configuration_data`: objeto raiz com `status`, `description` e coleções; `units[].unidade` contém o nome da unidade, apesar do schema usar `name`.
- `list_students_filter`: `{status, students, description}`. Além dos campos documentados, apareceram `id`, `student_ra`, `bonds`, `subjects` e `responsible_id`. Seus significados não foram inferidos sem validação.
- `accounting_data`: `{status, data, description}`. Além do schema publicado, apareceram `turma`, `turma_id`, `descricao_tipo`, `registro_cancelado`, `pagamento_renegociacao`, `competencia_ano` e `competencia_mes`.
- Ter um campo adicional não define sua semântica. Em especial, validar cancelamento, renegociação, valor recebido e cardinalidade da chave antes de qualquer automação.

## Próximo trabalho dependente deste diagnóstico

1. Resolver todas as 35 matrículas locais contra cadastro/matrícula/turma Proesc, incluindo pessoas não retornadas pelo recurso de catraca.
2. Confirmar períodos de vencimento necessários e completar as leituras financeiras da T42, separando blocos, cancelamentos e renegociações.
3. Validar a identidade da obrigação e preparar o confronto com as 340 parcelas legadas; tratar ambiguidades sem mutação automática.
4. Só então implementar o contrato V1 protegido no servidor e a consulta recorrente autorizada, preservando integralmente Banese segundo ciclo.

Ticket informado pelo usuário: **#166788**. A evidência nova permite informar ao suporte que V1 tem recursos funcionais, enquanto V2 permanece com recusa. Não foi enviado comentário ao ticket por ferramenta nesta etapa.
