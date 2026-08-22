# Pagamentos e Banese

Status: CANÔNICO. Última revisão: 2026-08-12.

## Papel no sistema

O domínio de pagamento administra emissão, baixa, conciliação, documento de
boleto, termos financeiros e proteção contra duplicidade.

As implementações principais ficam em:

- supabase/functions/gateways/
- supabase/functions/banese/
- supabase/functions/banese-boleto-document/
- supabase/functions/banese-cnab240-api/
- supabase/functions/banese-reconciliation-worker/
- supabase/functions/banese-student-payment/
- supabase/functions/dependencia-banese-checkout/

## Regras

- Valores e termos financeiros são resolvidos no backend.
- Emissão é idempotente e deve reutilizar o mesmo recebível em tentativas.
- Uma baixa precisa de evidência do canal apropriado.
- Conciliação e retorno bancário não podem liberar resultado acadêmico sem
  validação de estado.
- Títulos históricos mantêm seu contrato; não devem ser reinterpretados por
  alteração nova sem migração explícita.

## Dependência acadêmica

O boleto de dependência é separado da matrícula técnica. Ele tem uma parcela,
vencimento único e termos próprios gravados no título. A descrição para o
aluno e documento é neutra e limitada à disciplina.

O novo fluxo é boleto Banese. Não usar sincronização genérica para criar
dependência isolada, pois ela deve passar pelo checkout especializado.

## Configuração

As credenciais, certificados, chaves e URLs do banco são segredos de backend.
Configurar apenas por fluxo administrativo autorizado e secrets privados. Para
o operador funcional, conferir:

- integração bancária ativa;
- conta e política financeira corretas;
- cadastro suficiente do pagador;
- vencimento permitido;
- turma e disciplina elegíveis, quando se tratar de dependência.

## Referência histórica

Asaas aparece em partes do repositório por compatibilidade e fluxos legados.
Documentos antigos que o apresentam como rota atual de toda cobrança devem ser
tratados como LEGADO até revisão.

