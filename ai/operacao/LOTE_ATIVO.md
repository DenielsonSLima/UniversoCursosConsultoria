# Lote ativo

## Lote: 2026-11-10-nfse-fila-selecao-exclusao

Remover Atualizar da aba Pendentes e permitir seleção múltipla/exclusão lógica auditada de preparações NFS-e. Preservar recebimentos, snapshots, reservas históricas e bloqueios de emissão fiscal.

Mudança crítica por banco/RLS/financeiro/publicação. Manifesto explícito: `ai/operacao/registros/alteracoes/2026-11-10-nfse-fila-selecao-exclusao.md`. Base main b730d938b10faec950d9549b8ba371093c050fde, versão 4.8.282, revisão 291; candidata 4.8.283, revisão 292.

14 contratos, 28 testes SQL isolados e interação DOM do componente passaram; tipagem/lint focados e revisão independente aprovados. Migrations somente locais. Build completo, CI/Preview e publicação pendentes. Smoke Safari autenticado indisponível com Mac offline; nenhum registro real foi excluído. Usuário autorizou aplicar as duas alterações no banco e publicar a tela em 10/11/2026; emissão permanece bloqueada. Publicação aguarda CI e Preview do SHA exato.
