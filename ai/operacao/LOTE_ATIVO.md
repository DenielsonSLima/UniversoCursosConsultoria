# Lote ativo

## Lote: 2026-11-13-professor-portal-mobile
Objetivo: reformular todo o portal do professor após o login, com prioridade celular, e concluir cadastro/perfil docente do Gestor.
Status: implementação, revisão, conferência sintética no Safari e gates finais concluídos. PR #429 aberta em draft para revisão; candidato 4.8.339-rc.1. GitHub solicitado pelo usuário; produção não autorizada.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-11-13-professor-portal-mobile.md`.
Aceite: menu/polo e telas responsivos; frequência/notas/diários e conteúdo futuro usáveis no celular; contratos acadêmicos e documentos preservados; nenhum botão manual de atualização.
Regra operacional separada: `ai/operacao/registros/alteracoes/2026-11-13-regra-atualizacao-automatica.md`, por pedido explícito para skill/memória/RAG.
Guarda: quatro migrations novas locais; nenhum dado real alterado nem emissão/assinatura/baixa em produção. Sem merge/deploy em produção sem solicitação explícita.
Validação: componentes reais com dados sintéticos; usuário escolheu esse caminho após sessão local expirar. Safari em 360/390 px e 1280 px, contratos PGlite, testes React, build/TypeScript/ESLint e teto de 500 linhas aprovados.
Paralelo preservado: publicação 4.8.338 em main e lotes operacionais anteriores; nenhuma sincronização ampla do checkout.
