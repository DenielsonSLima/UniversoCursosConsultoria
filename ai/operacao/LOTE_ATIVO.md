# Lote ativo

## Lote: 2026-11-10-nfse-fila-selecao-exclusao

Remover Atualizar de Pendentes e permitir seleção múltipla/exclusão lógica auditada. Preservar recebimentos, snapshots, histórico e bloqueios fiscais. Mudança crítica por banco/RLS/financeiro/publicação. Manifesto: `ai/operacao/registros/alteracoes/2026-11-10-nfse-fila-selecao-exclusao.md`. Base b730d938b10faec950d9549b8ba371093c050fde; candidata 4.8.283/revisão 292.

Usuário autorizou banco e publicação em 10/11/2026. Duas migrations aplicadas; 18 documentos e 19 reservas mantêm contagens e hashes originais; nenhuma exclusão executada. Contratos, SQL isolado, interação DOM, tipagem/lint focados e revisão independente passaram. PR #377 aguarda CI/Preview do SHA final. Primeiro CI passou NFS-e e apontou apenas excesso de um trecho no resumo operacional, agora reduzido. Safari autenticado indisponível com Mac offline; smoke entre sessões pendente. Emissão continua bloqueada.
