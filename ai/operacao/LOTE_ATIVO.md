# Lote ativo

## Lote: 2026-10-06-filiacao-mae-obrigatoria

Estado: frontend preparado para 4.8.175; migration aplicada; produção autorizada pelo responsável, aguardando fechamento de validação, CI e Preview.
Objetivo: permitir cadastro e matrícula técnica com apenas o nome da mãe na filiação.
Aceite: nome da mãe obrigatório na validação do ingresso técnico; nome do pai opcional no formulário e no perfil, sem pendência cadastral ou bloqueio de matrícula por ausência do pai.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-10-06-filiacao-mae-obrigatoria.md`.
Risco: divergência entre checklist cliente e RPC corrigida por migration aditiva; função instalada conferida byte a byte, sem modificar cadastros reais.
Validação: 8 testes frontend e matriz de 20 casos aprovados; teste SQL em transação/rollback em validação. CI, Preview e publicação ainda não concluídos.
Smoke visual/autenticado Safari: pendente porque esta sessão não oferece Safari autenticado.
Base: main `c5315f327f48429a3a09314215aadee01d8b3ef2`, versão 4.8.174. GitHub e Supabase somente MCP.
Reunião: três agentes revisaram interface, regra canônica e publicação; divergência da RPC identificada e incluída no mesmo domínio. Migration remota `20261006172335` preserva assinatura/ACL.
