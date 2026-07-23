# CNAB240 Banese — contingência operacional

Esta Edge Function implementa o CNAB240 como segunda via operacional. A API de
cobrança Banese continua sendo o fluxo principal para registro, consulta e baixa
de boleto. O arquivo CNAB não substitui automaticamente a API e exige o código
EDI7 real de seis dígitos fornecido pelo banco.

## Organização

- `return-policy.ts`: limites, escopo, lease, validação ANSI/headers e
  fingerprint do evento.
- `return-preview.ts`: localização segura do recebível, snapshot financeiro e
  faixa permitida para desconto, multa e juros.
- `return-import.ts`: upload privado, deduplicação e persistência da prévia.
- `return-processing.ts`: revalidação, lease e transições de falha.
- `return-apply.ts`: confirmação, retomada e repetição idempotente por lote.
- `return-activation.ts`: projeções acadêmicas posteriores à baixa.
- `file-service.ts`: consultas, DTOs e download privado da remessa.
- `remittance-preparation.ts`: leitura canônica de recebíveis/pagadores e
  preparação dos títulos.
- `remittance-generation.ts`: reserva de NSA, arquivo, storage e claim atômico.
- `remittance-overview.ts`: resumo e títulos elegíveis para contingência.
- `remittance-policy.ts`: contrato fail-closed da remessa.
- `return-service.ts` e `remittance-service.ts`: fachadas estáveis para os
  imports públicos existentes.

## Baixa/cancelamento por CNAB

O manual local Banese v1.16 descreve o código de movimento de remessa `02` como
`Pedido de Baixa`. Isso não significa que seja seguro reutilizar o gerador de
inclusão:

- o gerador homologado localmente aceita somente `CNAB240_NEW_TITLE`;
- todos os segmentos detalhe são emitidos com movimento `01` (entrada);
- não existe modelo de instrução de baixa, vínculo de confirmação, estado de
  envio, tratamento de rejeição ou teste de homologação para movimento `02`;
- uma baixa presencial precisa primeiro obter cancelamento/baixa remota
  confirmada antes da baixa financeira local. A API é o caminho principal, mas o
  uso dela sobre um título originalmente registrado por CNAB precisa de
  confirmação/homologação explícita do Banese; sem isso, o sistema deve bloquear
  a operação.

Por isso, pedidos que tentem informar movimento `02`, `WRITE_OFF` ou outro tipo
de instrução são rejeitados. Não se deve montar uma remessa de baixa por
suposição. Uma futura implementação precisa de amostra oficial aceita pelo
banco, retorno de confirmação/rejeição, idempotência própria e homologação
separada.
