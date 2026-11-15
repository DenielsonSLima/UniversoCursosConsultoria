# Histórico Banese e revisão de títulos

Data: 15/11/2026. Classe: mudança crítica (financeiro, diagnóstico Supabase e publicação).
Autorização: usuário solicitou correção com três agentes e publicação em produção.
Status: validação e publicação em preparação; dois títulos legados conciliados por prova oficial; três diferenças aguardam definição.

## Objetivo e aceite

Corrigir a promessa de próxima consulta em títulos fora da fila executável e explicitar o estado local preservado para revisão. Conferir os cinco títulos em quarentena sem reemissão, cancelamento ou baixa por hipótese.

## Implementação

- `QUARANTINED` mostra suspensão até revisão e identifica gateway/estado locais. A data de próxima consulta só é apresentada para fila `READY`.
- Mensagem e contador do histórico empilham no celular; auditoria histórica e consultas recuperadas permanecem visíveis.
- Diagnóstico autenticado, isolado e somente leitura reconhece importação comprovada do portal. Exige transação única, identidade canônica, par bancário local válido, valor/fator/vencimento e valida CPF, nominal, vencimento e beneficiário no GET oficial. Dispensa somente os identificadores inexistentes de POST para esse legado.
- Retorno diagnóstico contém apenas comparação bancária por booleans, valores/datas/termos necessários à conferência. Não retorna documentos, números bancários, Pix ou resposta bruta.
- Ação individual explícita e autenticada para portal PDF reutiliza reconciliador, CAS, prova de pagamento e pós-baixa canônicos. Exige prova forte antes de qualquer ramo, novo GET estrito e par oficial exatamente igual ao local; não sincroniza parcelas futuras. O ramo de manutenção bancária é recusado antes e também por callback obrigatório, cobrindo corrida entre leituras.
- Não há mudança no reconciliador automático, cálculo de encargos, parser compartilhado, persistência financeira, esquema ou elegibilidade da fila.

## Manifesto explícito

- `modules/gestor/configuracoes/consulta-api-banese/BaneseAttemptsTable.tsx`
- `modules/gestor/configuracoes/consulta-api-banese/BaneseAttemptsTable.test.tsx`
- `supabase/functions/banese-reconciliation-worker/diagnostic.ts`
- `supabase/functions/banese-reconciliation-worker/diagnostic.test.ts`
- `supabase/functions/banese-reconciliation-worker/worker-action.ts`
- `supabase/functions/banese-reconciliation-worker/portal-pdf-reconciliation.test.ts`
- `supabase/functions/banese-reconciliation-worker/portal-pdf-reconciliation.ts`
- `supabase/functions/banese-reconciliation-worker/portal-pdf-evidence.ts`
- `supabase/functions/banese-reconciliation-worker/handler.ts`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-11-15-banese-historico-revisao.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-09-versao-4-8-276.md`
- `internal/versioning/changelog/2026-11-09-versao-4-8-277.md`

Total: 16 arquivos.

## Evidência operacional sanitizada

Banco/logs confirmaram 581 eventos históricos: 540 tiveram consulta posterior bem-sucedida; um pertence a título atualmente pago e 40 correspondem às oito falhas consecutivas de cinco títulos em quarentena. Dois diagnósticos antigos indicam divergência do par bancário e três indicam valor pago divergente da faixa calculada. Os três pagamentos foram confirmados novamente por GET oficial isolado, com dados de pagamento completos e identidade validada. A definição para tratar a diferença de encargos foi perguntada ao responsável; nenhuma tolerância, data, composição ou baixa foi inventada.

## Validação

- Frontend: seis testes focados de render, TypeScript e ESLint aprovados; smoke Safari desktop e viewport390 com tabela/cartões reais e dados sintéticos. Quarentena não anuncia agenda residual; fila pronta mantém data; cabeçalho móvel sem compressão do aviso.
- Backend: dezenove testes do diagnóstico e ação individual (GETs bancários, RPC/CAS canônico, replay, concorrência, faixa, origem e proibição de manutenção), deno check e ESLint aprovados. Testes de cálculo/baixa e identidade revisados pelas frentes independentes, sem bug reproduzível que justifique afrouxar guardas.
- Base inicialmente 4.8.342; publicação paralela 4.8.343 detectada e integralmente preservada. Release refeito sobre main 8f459a687944457a1d5d16273fdcf28abe95b8d6 como 4.8.344, revisão 353. Ficha PF local continua fora deste manifesto.
- Build completo com Node 24.22.1 e auditoria de linhas na base remota isolada aprovados. Revisão independente encontrou guarda de agência zero no diagnóstico; corrigida e testada.
- Worker v104 de diagnóstico e v105 da ação explícita publicados via MCP, preservando autenticação e 103 dependências remotas byte a byte. Duas rotas foram verificadas separadamente; a conciliação automática permaneceu intacta.
- Publicação frontend e verificação autenticada ainda pendentes.

## Execução autorizada em produção

A ação individual foi executada sequencialmente nos dois títulos comprovados do portal. Ambos responderam sucesso, pagamento confirmado e nenhuma sincronização futura pendente. A leitura posterior confirmou PAGO/PAID, R$260,00 por título, datas oficiais históricas, erro limpo, exatamente uma transação por título e fila DONE sem next_check_at. Sem nova emissão, baixa bancária por PUT ou alteração manual avulsa do recebível. As três diferenças de encargos continuam em revisão enquanto se aguarda a definição solicitada ao responsável.
