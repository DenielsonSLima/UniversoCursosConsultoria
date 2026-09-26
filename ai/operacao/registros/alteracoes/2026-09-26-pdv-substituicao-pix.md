# PDV: substituição autorizada com Pix oficial

Estado: VALIDADO — backend aplicado, publicação do código em andamento.

## Diagnóstico e correção

- Comparação com Técnico/EAD confirmou uso do adapter Banese comum. O parser de multa isenta, corrigido na 4.8.103, interrompia a confirmação após o POST de criação.
- GET do título afetado recuperou registro bancário, mas não trouxe Pix. Não era seguro construir QR a partir da linha digitável.
- Usuário autorizou expressamente cancelar esse atendimento e substituí-lo caso a consulta não recuperasse Pix.
- Worker restrito ao segredo interno e a autorização persistida por título: consulta identidade, valor, vencimento, termos e pagamentos antes da baixa; registra intenção durável e confirma cancelamento no banco.
- Nova tentativa usa UUID persistente e o mesmo serviço financeiro/adapter de Técnico/EAD. Repetição consulta o título existente; não cria outra tentativa.
- Reserva rejeita alteração de pagador, polo, valor, vencimento, descrição ou categoria frente ao snapshot autorizado.
- Trigger inicial teve acesso a campo ausente no registro genérico; migration corretiva aplicada imediatamente, antes da operação real. Migrations aplicadas preservadas para auditoria.

## Validação e resultado

- 31 testes focados aprovados: autorização/orquestração, intenção antes do POST, Pix da criação e idempotência de Outros Créditos. Deno check aprovado.
- Contratos SQL em transação com rollback: fence, permissões, UUID estável e rejeição de alteração no snapshot aprovados.
- Banese confirmou cancelamento do título anterior sem pagamento. Registro local e transação cancelados; histórico preservado.
- Uma única substituição de R$ 0,50 foi registrada, com payload Pix oficial e imagem QR presentes; uma transação por título. Nenhuma baixa de pagamento simulada.
- Backend banese-pdv-cancellation v2 aplicado via MCP. Compositores PDF e emissão acadêmica não alterados.
- Smoke Safari em produção confirmou QR oficial, botão Copiar Pix, cobrança substituta e acompanhamento automático sem botão de sincronização. PDF ainda não conferido; abertura interrompida por troca de aba. Não equivale a teste de liquidação bancária.

## Manifesto explícito

Total: 13 arquivos

- `supabase/functions/banese-pdv-cancellation/service.test.ts`
- `supabase/functions/banese-pdv-cancellation/reissue.ts`
- `supabase/functions/banese-pdv-cancellation/index.ts`
- `supabase/functions/banese-pdv-cancellation/service.ts`
- `supabase/migrations/20260926235000_guard_pdv_replacement_snapshot.sql`
- `supabase/migrations/20260926233100_fix_pdv_cancellation_trigger_record.sql`
- `supabase/migrations/20260926233200_reserve_banese_pdv_replacement.sql`
- `supabase/migrations/20260926233000_banese_pdv_cancellation_fence.sql`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-09-26-pdv-substituicao-pix.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
