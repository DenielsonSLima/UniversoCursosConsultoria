# Lote ativo

## Lote: 2026-11-13-professor-portal-mobile
Objetivo: reformular todo o portal do professor após o login, com prioridade celular, e concluir cadastro/perfil docente do Gestor.
Status: publicado em produção em 14/11/2026: 4.8.339 estável, revisão 348, PR #429 integrada. Lote entregue com a limitação de smoke autenticado registrada.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-11-13-professor-portal-mobile.md`.
Aceite: menu/polo e telas responsivos; frequência/notas/diários e conteúdo futuro usáveis no celular; contratos acadêmicos e documentos preservados; nenhum botão manual de atualização.
Regra operacional separada: `ai/operacao/registros/alteracoes/2026-11-13-regra-atualizacao-automatica.md`, por pedido explícito para skill/memória/RAG.
Guarda: quatro migrations aplicadas e pós-checagem aprovada; hashes e ledger no registro. Nenhuma nota, frequência, emissão, assinatura ou baixa real foi usada no smoke.
Validação: Safari sintético em 360/390 px e 1280 px, PGlite, build/TypeScript/ESLint, teto de linhas e 21 checks aprovados. Deploy READY; domínio HTTP 200 e bundle 4.8.339 ESTÁVEL confirmados.
Limitação: conferência autenticada do Professor pendente, conforme escolha pelos testes sintéticos após expiração da sessão. Base 4.8.338 e alterações paralelas preservadas.
