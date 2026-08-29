# Banese — seleção segura dos importados verificados

Data: 2026-08-29  
Estado: concluído com publicação atômica deste manifesto

## Conclusão da reunião

Os 32 itens exibidos no painel não representam 32 pagamentos perdidos. Eles
estão em `QUARANTINED`, portanto fora da baixa automática: 19 são títulos de
Radiologia cujo retorno Banese reduziu zeros à esquerda do Nosso Número, e 13
são títulos T42 que registraram a antiga falha interna de persistência. Não
houve reabertura, baixa, emissão ou cancelamento neste lote.

Os 13 títulos novos de Adenize correspondem a uma rematrícula e 12 parcelas.
Permanecem pendentes, sem pagamento, sem baixa e sem duplicidade. O histórico
`SISTEMA_ANTERIOR` dessa matrícula é separado e não é alvo da conciliação.

## Correção aplicada

A exclusão genérica pela origem `BANESE_API_LEGACY_DISCOVERY` impedia também
os 196 boletos de Radiologia realmente importados pela API Banese. A regra foi
substituída por prova positiva antes da consulta: título em aberto, Nosso
Número de nove dígitos, `API` e `API_REGISTERED`, termos financeiros
confirmados e transação Banese com Nosso Número, linha digitável e código de
barras iguais aos do título.

A migration não atualiza `contas_receber`, transações nem fila. Ela preserva
`QUARANTINED`, a reserva atômica, `SKIP LOCKED`, invocador seguro e execução
exclusiva por `service_role`.

## Validação em produção

- seleção por origem removida da RPC: confirmada;
- evidência financeira completa exigida: confirmada;
- importados API de Radiologia aptos pela prova: 196;
- estado da fila após a migration: 206 `READY`, 32 `QUARANTINED`, 27 `DONE`;
- testes focados de contrato: 6 aprovados.

Os títulos serão consultados somente quando alcançarem `next_check_at`; o lote
não força consulta nem baixa. Assim, o progresso P3 conta consultas reais e
seguras, não o total bruto de títulos agendados.

## Migration aplicada

| Arquivo | ID remoto | SHA-256 |
| --- | --- | --- |
| `20260829203000_restore_verified_banese_imports_to_reconciliation.sql` | `20260829203000` | `e2be35f892e873cef1707005347e4d6d039c7c225b78e0becbcdfbdceab2f8fb` |

## Manifesto explícito

Total: 6 arquivos (3 modificados, 3 adicionados, 0 removidos)

### Modificados

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/qualidade/migrations-aplicadas.json`

### Adicionados

- `ai/operacao/registros/alteracoes/2026-08-29-selecao-banese-importados-verificados.md`
- `supabase/migrations/20260829203000_restore_verified_banese_imports_to_reconciliation.sql`
- `supabase/tests/banese_verified_import_queue_selection.contract.test.ts`
