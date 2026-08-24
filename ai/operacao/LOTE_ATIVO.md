# Lote ativo

Estado: `PUBLICADO_PRODUCAO_4_7_3`

## Lote: 2026-08-23-fidelidade-diario-assinaturas-acessos-4-7-3

- Pedido: corrigir as turmas e o Diário, reutilizar os modelos configurados, validar Professor/coordenação/Aluno/Responsável e publicar o resultado.
- Base remota final: PR `#83` integrada por squash na `main`, commit `2f6461bf53459e6ab7a9e827c174113173719fc6`.
- Registro: `ai/operacao/registros/alteracoes/2026-08-23-fidelidade-diario-assinaturas-acessos-4-7-3.md`.
- Manifesto explícito: `ai/operacao/registros/alteracoes/2026-08-23-fidelidade-diario-assinaturas-acessos-4-7-3.md`.
- Versão: `4.7.3` estável.
- Supabase: treze migrations aplicadas via MCP e `assinatura-eletronica-diario-artefatos` v13 ativa com JWT.
- Produção: Vercel `9uowbC2EimqTeexBXv2hPd91Ro3k` concluída com sucesso; versão pública `4.7.3` estável.

### Critérios de aceite

1. Gestor lista as turmas técnicas e livres temporárias pelo contrato canônico. `ATENDIDO`.
2. Professor reutiliza o Diário do Gestor e acessa somente as próprias disciplinas. `ATENDIDO`.
3. Coordenação permanece uma capacidade adicional do perfil Professor. `ATENDIDO`.
4. Capa, página 2, contracapa, campos, QR e marca d'água vêm das configurações salvas, sem fallback genérico. `ATENDIDO`.
5. Professor assina antes do Coordenador; o final contém duas páginas de evidências e comprovante separado. `ATENDIDO_POR_CONTRATO`; smoke real bloqueado pela ausência de sessão Gestor controlável.
6. Gestor possui módulo `Assinaturas` com caixa, acervo, filtros e Diário final; categorias sem backend seguro ficam indisponíveis. `ATENDIDO`.
7. Aluno, carteirinha, notas, Responsável e dependente passam pelos contratos reais. `ATENDIDO`.
8. Nenhuma cobrança, boleto ou operação Banese é criada. `ATENDIDO`.
9. CI, Preview, merge e Vercel Produção devem concluir antes do encerramento. `ATENDIDO`.

### Validação

- Acessos e navegação: 34/34.
- Aluno e Responsável: 57/57; carteirinha CIE emitida pelo RPC do aluno.
- PDF/assinaturas/interface: 193 contratos.
- Edge de artefatos: 112 contratos; versão remota 13.
- Acervo do Gestor: 10 contratos.
- Diário assinado na turma: 5 contratos Node.
- TypeScript, ESLint, Deno, teto, versão, operação, RAG e build: aprovados localmente e no CI.
- GitHub: Controle de versão `#229` e Qualidade do produto `#261` aprovados; PR `#83` integrada na `main`.
- Produção: `/`, `/login`, `/gestor`, `/professor`, `/aluno` e `/validador` responderam HTTP 200; o bundle público contém `4.7.3`, `ESTÁVEL` e o resumo oficial do lote.
- Safari remoto: janela autenticada visível ao usuário, mas indisponível ao controlador por `cgWindowNotFound`; contratos públicos substituem somente o que pode ser comprovado sem UI.

### Limites e exclusões

1. Contratos e Matrículas aparecem como categorias futuras em `Assinaturas`, desabilitadas até existir pipeline autorizado próprio.
2. O smoke real não foi fabricado: o Safari não ficou controlável e a preparação do envelope exige uma sessão Gestor; nenhum SQL administrativo contornou RLS.
3. Artefatos temporários de teste e renders não integram o lote.
4. Nenhum fluxo financeiro ou Banese integra esta entrega.

Histórico: `ai/operacao/registros/ALTERACOES.md` e `ai/operacao/registros/alteracoes/`.
