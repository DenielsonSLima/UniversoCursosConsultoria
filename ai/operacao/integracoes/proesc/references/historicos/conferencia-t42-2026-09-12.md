# Referência histórica — não orientar novas consultas

Arquivado em 01/10/2026. A escolha operacional agora é V2; leia [contrato vigente](../v2-operacional.md). O texto abaixo preserva diagnósticos e decisões anteriores, sem afirmar o estado atual de produção.

# Conferência ampliada da T42 — 12/09/2026

Continuação do [diagnóstico inicial](../diagnostico-2026-09-12.md), após o usuário solicitar todas as cobranças do primeiro ciclo e confirmar que o segundo pertence ao Banese.

## Cobertura efetivamente consultada

- API V1 `accounting_data`, única unidade Proesc da matriz.
- 48 consultas mensais: janeiro/2024 a dezembro/2027. Todas retornaram HTTP 200, `status: success` e coleção `data`, sem truncamento.
- 2025/2026 cobrem o período principal. 2024/2027 foram verificados para localizar vencimentos fora desse intervalo, não para classificá-los como primeiro ciclo.
- A turma foi resolvida por seu `turma_id` retornado para o rótulo `ENF T-42 INT`. Não houve conflito entre identidade e rótulo na seleção.
- Foram conservados os registros marcados como cancelados e todas as linhas contábeis. Não houve deduplicação por bloco, soma financeira aplicada ou baixa.

## Resultado agregado

| Medida | Resultado |
| --- | ---: |
| Linhas contábeis da T42 | 1.796 |
| Chaves contábeis distintas | 615 |
| Grupos sem marca de cancelamento | 346 |
| Grupos com marca de cancelamento | 269 |
| Pessoas no financeiro, todas encontradas localmente por CPF | 34 |
| Matrículas locais | 35 |
| Parcelas locais do legado | 340 |
| Candidatos únicos não cancelados com mesmo CPF, vencimento e principal | 340 |
| Grupos não cancelados adicionais | 6 |
| Títulos Banese protegidos | 78 |

Os principais observados começaram em abril/2025 e terminaram em maio/2027. Não apareceram registros da turma em 2024 nem após maio/2027 dentro da cobertura consultada.

Todos os 340 candidatos têm chaves distintas. Isso confirma correspondência dos registros importados, mas **não prova que todos pertençam às 12 mensalidades do primeiro ciclo**. O próprio legado contém casos acima de 12 registros; a classificação exige o grupo do débito.

## Checagem com a imagem enviada

O exemplo individual fornecido pelo usuário mostrou 12 parcelas e total bruto R$ 3.358,80. A API retornou exatamente 12 principais não cancelados, entre outubro/2025 e setembro/2026, somando esse valor. O nome do aluno e os detalhes individuais permanecem no relatório privado de trabalho, fora do repositório.

As cinco datas de 2027 pertencem a uma única pessoa que já possui 20 registros no legado; a API devolveu 25 principais para ela, todos associados à T42. Essa associação não resolve se os cinco adicionais são primeiro ciclo, outro débito ou erro de vínculo. O usuário foi consultado sobre nome e quantidade de parcelas do grupo na ficha de Débitos.

A sexta cobrança adicional pertence a outra pessoa e vence em agosto/2026, R$ 229,90. Ela possui 13 registros no legado e 14 no Proesc. Não presumir duplicidade, nem importar por simples presença na API.

## Recebimentos: contrato real e limitações

O retorno observado contradiz a legenda exemplificativa de blocos na documentação V1:

- `id=1`: 615 principais, todos sem data de pagamento.
- `id=2`: 299 linhas com data de pagamento, compatíveis com recebimentos na comparação local. Não aplicar automaticamente a legenda documental “juros”.
- `id=3` e `id=4`: 39 linhas cada, todas datadas; classificação não comprovada.
- `id=6`: 269 linhas somente nos grupos marcados como cancelados.
- `id=7`: 109 linhas datadas, valor observado de R$ 2,50.
- `id=10482`: 426 linhas, das quais 19 datadas; composição depende de confirmação.
- `descricao_tipo` identifica a natureza do débito, predominantemente “MATRÍCULA”, e não a descrição do bloco.

Nos 189 registros locais PAGO, todos possuem bloco 2 e a mesma data de pagamento local. Em 188, a soma observada das linhas do bloco 2 coincide com `valor_pago`; um registro diverge: valor local R$ 229,90 e bloco 2 de R$ 50,00, principal R$ 279,90.

Entre os 151 locais PENDENTE, 15 possuem linhas do bloco 2 datadas de 28/08 a 12/09/2026. A soma como retornada é R$ 4.099,00. São candidatos a recebimentos posteriores à importação, **hipótese sujeita à validação**, não baixas autorizadas pelo simples total.

Há linhas do bloco 2 idênticas no mesmo retorno mensal: três grupos pagos com cinco linhas e nove pendentes com dez linhas. Elas diferem apenas na posição da resposta. Não descartar repetições nem presumir cartão parcelado; não aplicar soma como total financeiro confirmado sem comprovar o significado.

`forma_pagamento` aparece como inteiro no bloco 2 e string nas demais linhas. Flags foram booleanos reais; `pagamento_renegociacao` estava falso nas 1.796 linhas. Ausência de flag positiva não resolve a origem de cada débito.

## Preservação e histórico

- Nenhum recebível, valor pago, matrícula, ciclo ou boleto foi alterado.
- Hashes completos do conjunto Banese e do legado permaneceram iguais antes/depois da consulta. Os hashes e correspondências pessoais ficaram na execução privada.
- Foi registrado evento `CONSULTA / PARCIAL / PROESC_API` no histórico da T42, com 1.796 linhas e resumo agregado. A parcialidade refere-se à classificação/conciliação pendente, não a erro de leitura nos 48 meses.
- Automação e importação adicional continuam pendentes da identificação das 12 parcelas por débito e da validação dos recebimentos.
