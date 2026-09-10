# Lote ativo

Estado: `VALIDADO PARA PUBLICAÇÃO — 4.8.38`

## Lote: 2026-09-09-recuperacao-turnstile

- Pedido: publicar no GitHub e em produção a recuperação do Turnstile, autorizada em 09/09/2026.
- Risco: feedback e ciclo de vida da proteção de acesso; sem mudança de backend ou chaves.
- Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-09-recuperacao-turnstile.md`

### Aceite

1. Oferecer nova tentativa após 20 segundos de silêncio ou até 8 segundos de erros repetidos.
2. Manter o login bloqueado sem token verificado e aceitar sucesso válido tardio.
3. Descartar callbacks antigos e limpar timers ao reiniciar ou desmontar.
4. Publicar somente o manifesto validado, com CI, Preview e conferência HTTP da produção.

- Revisão independente aprovada; 55 testes de autenticação, TypeScript completo, build e teto de linhas aprovados.
- Restrição explícita do usuário: não acessar navegador. Smoke visual/desafio real permanece pendente.
- Evidências finais de build, CI, Preview e produção serão registradas no PR da 4.8.38.
