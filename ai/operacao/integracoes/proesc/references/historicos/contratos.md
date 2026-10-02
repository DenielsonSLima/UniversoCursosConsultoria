# Referência histórica — não orientar novas consultas

Arquivado em 01/10/2026. A escolha operacional agora é V2; leia [contrato vigente](../v2-operacional.md). O texto abaixo preserva diagnósticos e decisões anteriores, sem afirmar o estado atual de produção.

# Contratos e autenticação Proesc

Fontes oficiais coletadas em 12/09/2026. Consulte o [catálogo completo](../../documentation/CATALOGO.md) para todas as operações e os OpenAPI originais.

| Família | Base | Credencial | Leitura inicial |
| --- | --- | --- | --- |
| V1 escolar | `https://app.proesc.com/api/v1` | Query `token`, chave da entidade | `GET /configuration_data` |
| V2 escolar | `https://api.proesc.com/api/v2` | Header `Authorization: Bearer {token}` | `GET /people?page=1` ou carga documentada |
| Documentação V2.1 / Bora Estudar | `https://api.proesc.com/api/v1/bora-estudar` | Bearer | Recursos específicos de ENEM e melhores alunos; fora da conferência financeira T42 |

O contrato é definido pelo servidor, método e parâmetros da operação, não apenas pelo número no menu. Os OpenAPI V1 mantêm uma descrição interna “Proesc API 2.0”, apesar do servidor e da versão serem V1.

## V1: parâmetros e semântica

- `configuration_data`: fornece unidades, exercícios e categorias. A leitura real de 12/09 retornou objeto raiz, `status: success`, descrição e coleções; a unidade usou `unidade` como nome, diferente de `name` no schema.
- `list_students_filter`: `token` e `unidades` obrigatórios; `ano_letivo` acadêmico opcional. O CPF documentado chama-se `identification`; não converter identificadores em números nem perder zeros à esquerda.
- `general_student_list`: documento lista token e exercício. Teste real sem unidade retornou `status: error` e `description: unit id required`, mesmo com HTTP 200. O nome exato do parâmetro adicional não foi confirmado por essa mensagem; não apresentar uma suposição como contrato provado.
- `financial_statement`: `ano_letivo` significa ano de vencimento, `unidade_id` filtra unidade. Testes de 2026, inclusive com unidade resolvida, redirecionaram para `/erro`; não há extrato validado desse recurso.
- `accounting_data`: exige `unidade_id`, `ano_letivo` (ano de vencimento) e `mes`. `dia`, `id_chave`, `id`, `data_pagamento` são filtros opcionais. Há composição em blocos de receita, juros, multa, desconto e cancelamento; ver [conciliação](../conciliacao-t42.md).

Os exemplos documentais dos códigos de bloco divergem do [retorno real ampliado da T42](../conferencia-t42-2026-09-12.md): `id=2` contém valores/datas compatíveis com recebimentos locais; `descricao_tipo` é natureza do débito. Não codificar a legenda exemplificativa como regra de baixa.

Não presumir paginação V2 em V1. Uma resposta grande, erro lógico, timeout ou envelope desconhecido deve impedir conclusão de completude. `[]` confirmado difere de erro e de objeto não reconhecido.

## V2: recursos e limitações

- Na conexão Universo, o suporte forneceu o header `x-proesc-waf`, usado junto de `Authorization: Bearer`. O valor está no armazenamento seguro da conexão V2; não copiá-lo para documentação, código ou logs. Não inventar nem estender essa liberação a outros hosts.
- Pessoas respondeu HTTP200 com esse contrato em 18/09/2026 e no probe de servidor às 00:28UTC de 19/09. A evidência nova e as limitações estão no [guia V1/V2](../guia-v1-v2.md#evidencias-e-limites); substitui a conclusão de bloqueio de people do diagnóstico inicial, sem validar os demais recursos.
- `people`: filtros `unit_id`, `page`; dados de pessoa, CPF, RA, matrículas e responsáveis conforme o schema.
- `invoices`: filtros `expiration_year`, `expiration_month`, `unit_id`, `invoice_type_id`, `page`; na ausência de período, a documentação usa ano/mês corrente.
- `configuration_data`: carga de IDs para consulta; `grades`: notas. Ver parâmetros de cada operação, sem inferir a partir de outro recurso.
- A documentação de `invoices` expõe `invoice_id`, status, valores e dados do boleto, mas precisa de validação real do vínculo pessoa/matrícula e do envelope antes de importar.
- Existem grafias e estruturas peculiares nos schemas (`sucess`, arrays contendo envelopes, informações financeiras aninhadas em `discounts`). Preservar a origem e confirmar no retorno, sem corrigir silenciosamente o contrato do provedor.

## Operações que alteram o Proesc

As introduções gerais dizem GET, mas os contratos por operação documentam **POST `/turn_frequency` na V1** e **POST `/debits/create` na V2**. Estão no catálogo para completude. O trabalho autorizado de consulta do legado não exige executar esses recursos.

## Fontes

- [Autenticação V1](https://proesc.readme.io/v1.0/reference/autorizacao)
- [Carga V1](https://proesc.readme.io/v1.0/reference/configuration_data)
- [Contabilidade V1](https://proesc.readme.io/v1.0/reference/accounting_data)
- [Cadastro V1](https://proesc.readme.io/v1.0/reference/list_students_filter)
- [Autenticação V2](https://proesc.readme.io/reference/autorizacao)
- [Parcelas V2](https://proesc.readme.io/reference/parcelas)
- [Bora Estudar](https://proesc.readme.io/v2.1/reference)
