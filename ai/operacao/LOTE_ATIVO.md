# Lote ativo

## Lote: 2026-11-15-professor-turma-pix-opcional
Objetivo: sugerir a última turma ao selecionar professor em despesas e oferecer tipo/chave Pix opcionais no cadastro e no perfil Financeiro.
Status: implementação validada para entrega 4.8.343; acompanhamento remoto no PR do lote.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-11-15-professor-turma-pix-opcional.md`.
Aceite: Sim automático por professor, última turma do mesmo polo, intervenção manual preservada e vínculo opcional; Pix opcional, tipo explícito, edição estreita com RLS, sem alterar outros dados ou acesso.
Validação: testes focados, lint, build e smoke real Safari com dados sintéticos aprovados; migration aplicada, legado/RLS preservados e ensaio real com ROLLBACK confirmado. Publicação e conferência remota no PR do lote.
Lote anterior: `ai/operacao/registros/alteracoes/2026-11-15-cartas-credito-categoria-fornecedores.md` (operação de dados já aplicada e conferida).
