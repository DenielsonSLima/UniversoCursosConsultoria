# Lote ativo

## Lote: 2026-11-16-cupons-percentual-manual-matriz
Objetivo: percentual manual, gestão somente pela Matriz e uso em cursos EAD de todos os polos.
Status: banco e payment-checkout v33 aplicados; frontend 4.8.357 em publicação autorizada.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-11-16-cupons-percentual-manual-matriz.md`.
Aceite: percentual vazio por padrão, entrada manual até duas casas; Matriz ativa e permissões conferidas pelo servidor; cupom válido em todos os polos da instituição; compra sem cupom opcional; outras modalidades não aceitam cupom; preservação de fatos existentes e retomada segura.
Base remota: 4.8.356, commit 2d3e5696671ac9bd73db84a79a8e0c2e8899e9a6; publicação paralela preservada.
Validação: 133 testes locais, HTTP, TypeScript, lint e build aprovados; Safari desktop/375×744 conferiu percentual manual. Probe remoto passou; cupom, resgate e banco preservaram fingerprints.
