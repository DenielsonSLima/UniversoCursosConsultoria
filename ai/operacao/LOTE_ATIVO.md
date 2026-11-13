# Lote ativo

## Lote: 2026-11-13-ead-confianca-confirmacao-manual
Objetivo: concluir a confiança EAD de24 horas com prova e certificado, corrigindo a projeção acadêmica da confirmação manual canônica da própria matrícula.
Status: implementação e revisão cruzada concluídas;49 testes SQL funcionais aprovados. Publicação autorizada, validação concorrente PostgreSQL17 e produção em fechamento; ativação final permanece fechada até os aceites.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-11-13-ead-confianca-confirmacao-manual.md`.
Base publicada:4.8.333, merge3882478317aaed8c4a277ab17ff41631bf3d50ae; interface compacta e entrega EAD4.8.332 preservadas.
Aceite do usuário: todos os internos com Gestão EAD nos polos autorizados, sem exigir Financeiro, podem conceder confiança uma única vez. Cobrança obrigatória preservada; pagamento confirmado torna o acesso definitivo. Sem confirmação em24 horas, curso bloqueado e certificado revogado; pagamento posterior gera novo código sem revalidar o revogado.
Guarda: nenhum pagamento, liberação, cancelamento bancário ou certificado real como teste; nenhuma sessão de navegador controlada. Fontes de migrations já aplicadas são imutáveis.
Publicação: migration nova225925, finalizadores com retry somente40P01 e ativação225950 após CI/prod. Funções Edge preservam JWTtrue e todas as dependências remotas atuais; overlay apenas dos finalizadores e helper deste lote.
Validação: testes funcionais, clientes reais em DOM e tipagem; concorrência PostgreSQL17 obrigatória no CI. Manifesto limitado ao lote, sem sincronização ampla do checkout ou das funções remotas.
