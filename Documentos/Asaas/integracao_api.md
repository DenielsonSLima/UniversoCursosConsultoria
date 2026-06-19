# Integração Asaas - Endpoints e Payload de Integração (API v3)

Este documento detalha os formatos de dados (JSON) aceitos pela API do Asaas na versão v3 para as principais operações do ERP.

---

## 1. Cadastro de Clientes (Alunos)

Toda cobrança necessita de um cliente vinculado. Antes de emitir boletos ou Pix, o aluno deve estar cadastrado no Asaas.

*   **Endpoint:** `POST /v3/customers`
*   **Headers:**
    ```http
    access_token: $your_api_key
    Content-Type: application/json
    ```
*   **Corpo da Requisição (JSON):**
    ```json
    {
      "name": "João da Silva Sauro",
      "email": "joao.sauro@exemplo.com",
      "phone": "7932111122",
      "mobilePhone": "79999998877",
      "cpfCnpj": "00000000000",
      "postalCode": "49000000",
      "address": "Avenida Beira Mar",
      "addressNumber": "1024",
      "complement": "Apto 302",
      "province": "Atalaia",
      "externalReference": "db-parceiro-uuid-1234",
      "notificationDisabled": false
    }
    ```
*   **Retorno Relevante (JSON):**
    ```json
    {
      "object": "customer",
      "id": "cus_000005748392",
      "name": "João da Silva Sauro"
      // ...outros campos retornados
    }
    ```

---

## 2. Geração de Cobrança Avulsa (Matrícula)

Usado para cobrar a taxa de inscrição/matrícula de forma avulsa por boleto, cartão ou Pix.

*   **Endpoint:** `POST /v3/payments`
*   **Corpo da Requisição (JSON):**
    ```json
    {
      "customer": "cus_000005748392",
      "billingType": "UNDEFINED", 
      "value": 150.00,
      "dueDate": "2026-06-25",
      "description": "Taxa de Matrícula - Técnico em Enfermagem",
      "externalReference": "matricula-uuid-abc",
      "postalService": false
    }
    ```
    > [!TIP]
    > O `billingType` pode ser `BOLETO`, `CREDIT_CARD`, `PIX` ou `UNDEFINED` (deixa o aluno escolher a forma de pagamento no portal do Asaas).

---

## 3. Emissão de Mensalidades (Parcelado ou Assinatura)

Para cursos técnicos de longa duração (ex: 22 parcelas), a melhor prática é gerar um **Parcelamento** ou **Assinatura Recorrente** para evitar ter que registrar mensalmente.

### Opção A: Parcelamento (Carnê)
Gera uma quantidade fixa de cobranças de uma só vez. Ideal para carnês.
*   **Endpoint:** `POST /v3/payments`
*   **Corpo da Requisição (JSON):**
    ```json
    {
      "customer": "cus_000005748392",
      "billingType": "BOLETO",
      "installmentCount": 22,
      "installmentValue": 350.00,
      "dueDate": "2026-07-10",
      "description": "Mensalidades Técnico em Enfermagem (Carnê)",
      "externalReference": "turma-matricula-id"
    }
    ```

### Opção B: Assinatura Recorrente (Cobrança Automática)
Gera uma cobrança automática a cada ciclo (ex: mensal) até ser cancelada.
*   **Endpoint:** `POST /v3/subscriptions`
*   **Corpo da Requisição (JSON):**
    ```json
    {
      "customer": "cus_000005748392",
      "billingType": "BOLETO",
      "value": 350.00,
      "nextDueDate": "2026-07-10",
      "cycle": "MONTHLY",
      "description": "Assinatura Mensal - Curso Técnico"
    }
    ```

---

## 4. Split de Pagamento (Divisão de Valores)

Indispensável para o pagamento automático de polos terceirizados ou convênios. O split é configurado no envio do payload de criação da cobrança/assinatura.

*   **Parâmetro no JSON de Cobrança (`POST /v3/payments` ou `POST /v3/subscriptions`):**
    ```json
    {
      "customer": "cus_000005748392",
      "billingType": "PIX",
      "value": 350.00,
      "dueDate": "2026-07-10",
      "split": [
        {
          "walletId": "wallet-uuid-do-parceiro",
          "percentualValue": 40.00, 
          "totalFixedValue": null
        }
      ]
    }
    ```
    *   `percentualValue`: Define a porcentagem líquida que irá para o parceiro (40% no exemplo acima).
    *   `fixedValue` ou `totalFixedValue`: Se preferir transferir um valor fixo (ex: R$ 50,00 por parcela).
