# Integracao Bancaria Banese Card

Esta nota registra a leitura dos documentos locais em `Documentos/forum banese api`
e dos PDFs oficiais do Banese usados como referencia para pre-configuracao do
banco/provedor Banese Card.

## Autenticacao

O Banese Card nao usa uma chave unica no formato do Asaas. A autenticacao principal
e OAuth 2 `client_credentials`, com `Client ID` e `Client Secret` fornecidos
pelo banco apos habilitacao do convenio.

O sistema deve solicitar token no endpoint do ambiente e usar o retorno como:

```text
Authorization: Bearer <access_token>
```

## Boleto / API Cobranca

Base URLs:

- Sandbox: `https://sandbox.banese.b.br/cobranca/v1`
- Producao: `https://webapi.banese.b.br/cobranca/v1`

Token:

- Sandbox: `https://sandbox.banese.b.br/autenticacao/oauth/v1/token`
- Producao: `https://webapi.banese.b.br/autenticacao/oauth/v1/token`

Token body:

```text
grant_type=client_credentials&scope=boletos
```

Endpoints principais:

- Criar boleto: `POST /convenios/{id_convenio}/boletos`
- Alterar boleto: `PUT /convenios/{id_convenio}/boletos/{nosso_numero}`
- Baixar boleto: `PUT /convenios/{id_convenio}/boletos/{nosso_numero}/baixa`
- Consultar boleto: `GET /convenios/{id_convenio}/boletos/{nosso_numero}`
- Consultar pagamentos: `GET /convenios/{id_convenio}/boletos/{nosso_numero}/pagamentos/efetivados`

## Pix / API SAB Guias

Base URLs:

- Sandbox: `https://apipix-h.banese.b.br/guias/v1`
- Producao: `https://apipix.banese.b.br/guias/v1`

Token:

- Sandbox: `https://apipix-h.banese.b.br/security/v3/oauth/token`
- Producao: `https://apipix.banese.b.br/security/v3/oauth/token`

O manual tambem descreve etapa de certificado/CRT Access Token para comunicacao
com a API Pix. Esse valor deve ficar em segredo/Vault.

Endpoints relevantes:

- Criar guia com vencimento: `POST /manutencao/guiaVencimentoFuturo`
- Criar guia imediata: `POST /manutencao/guiaImediata`
- Consultar guia: `GET /manutencao/guias/{CodigoDeBarra}`
- Webhook Pix: `PUT /manutencao/webhook/{chave}`

## O que pedir ao gerente Banese Card

Para boleto:

- Habilitacao da API de Cobranca/Boleto para o CNPJ da escola.
- `Client ID` e `Client Secret` de sandbox e producao.
- Codigo do convenio de boleto.
- CPF/CNPJ do beneficiario cadastrado no convenio.
- Regras de Nosso Numero, carteira, especie, baixa/devolucao, multa, juros e desconto.

Para Pix/SAB Guias:

- Habilitacao da API Pix/SAB Guias.
- `Client ID` e `Client Secret` de sandbox e producao, se forem separados da cobranca.
- CRT Access Token/certificado para obter certificado de comunicacao Pix.
- Codigo do convenio Pix/SAB Guias.
- Chave Pix cadastrada no Banese.
- Confirmacao do formato de webhook e ambiente de homologacao.
- Confirmacao do header `Terminal`:
  - Homologacao: `99000090054`
  - Producao: `99000090049`
- Confirmacao do endpoint de certificado descrito no manual como `/manutencao/cerificado`.
  O texto do manual aparece sem a letra `t`; confirmar se e erro de digitacao ou endpoint real.
- Formato do certificado cliente, senha, cadeia/CA e prazo de renovacao, caso o certificado
  precise ser armazenado ou enviado pela Edge Function.

Para cartao de credito:

- A documentacao local fornecida cobre boleto e Pix/SAB Guias.
- Como o Banese Card nao aceita cartao de credito neste fluxo, rota `CREDIT_CARD`
  deve permanecer em Asaas ou Mercado Pago.
