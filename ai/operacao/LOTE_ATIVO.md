# Lote ativo

## Lote: 2026-11-12-ead-confianca-lifecycle
Objetivo: alinhar a liberação EAD por confiança para usuários internos com Gestão, sem exigir Financeiro; 24 horas incluem aulas, prova e certificado temporariamente válido.
Status: implementação e revisão cruzada concluídas; regras preparatórias instaladas com ativação fechada; candidato 4.8.332 em validação final e publicação autorizada.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-11-12-ead-confianca-lifecycle.md` (em definição final).
Base publicada: 4.8.331, PR #422, merge d88cc7b04b0af17459e3f13b9be39f5bde953c5a; preservar os lotes anteriores.
Aceite confirmado pelo usuário: todos os internos com Gestão EAD nos polos autorizados podem liberar; sem Financeiro, matrícula continua gerando cobrança obrigatória. Pagamento confirmado mantém acesso definitivo; ausência de confirmação em 24h bloqueia e revoga o certificado da mesma matrícula; expiração da cobrança respeita o fluxo financeiro canônico.
Guarda: somente EAD, sem baixa financeira pela confiança, sem renovação automática do prazo, sem tocar certificados pagos ou de outras matrículas. Revogação preserva documento e trilha de auditoria.
Limitações: comprovante é conferido manualmente; nenhuma nova operação bancária, liberação de aluno ou revogação real será usada como teste; nenhum navegador controlado.
Fechamento: manifesto de 50 arquivos; testes funcionais/DOM, TypeScript e build aprovados. Três cenários de concorrência com PostgreSQL 17 passaram; a adequação do teste de identidade ao ID exato integra a árvore final. CI da árvore final antecede a produção e a ativação final. Índice local RAG atualizado uma vez após estas fontes finais.
