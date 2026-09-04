# Lote ativo

Estado: `PRONTO PARA PUBLICAÇÃO — VALIDAÇÃO LOCAL CONCLUÍDA`

## Lote: 2026-09-02-feedback-progresso-emissao-ciclo-tecnico

- Pedido: substituir a tela vazia durante a emissão do ciclo técnico por uma
  experiência em tela cheia que informe claramente que o sistema continua
  trabalhando, mostre etapas, tempo decorrido e o resultado final.
- Autorização: implementação, GitHub e produção autorizados explicitamente pelo
  gestor em 02/09/2026.
- Risco: crítico por estar no fluxo financeiro, embora o patch não altere banco,
  Edge Function, payload ou contrato Banese.
- Registro:
  `ai/operacao/registros/alteracoes/2026-09-02-feedback-progresso-emissao-ciclo-tecnico.md`.
- Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-02-feedback-progresso-emissao-ciclo-tecnico.md`.

### Contrato preservado

1. A emissão continua sendo uma única operação idempotente e retomável.
2. Nenhum percentual bancário é inventado; a barra é indeterminada.
3. A prévia canônica permanece visível por snapshot enquanto a lista atualiza.
4. Um bloqueio síncrono impede clique duplo antes do estado React renderizar.
5. Sucesso, falha e interrupção continuam usando notificações visuais do portal.

### Validação local

- 40 testes focados do ciclo técnico aprovados.
- ESLint focado, TypeScript e teto de 500 linhas aprovados.
- Build de produção aprovado com 3.960 módulos transformados.
- Revisão em três frentes concluída sem achado bloqueador.
- O smoke visual não executará nova emissão bancária real apenas para validar a
  apresentação; a resposta controlada cobre o estado de espera com segurança.
