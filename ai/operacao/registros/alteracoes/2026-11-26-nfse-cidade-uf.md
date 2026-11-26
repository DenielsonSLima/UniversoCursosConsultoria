# Identificação compacta dos polos no Emissor NFS-e

Data: 2026-11-26
Versão: 4.8.374

## Entrega

- Mostra cidade/UF e valor lado a lado no card da Matriz. O título fica disponível para leitores de tela, sem ocupar espaço visual.
- Localização vem do catálogo já carregado pelo seletor autorizado, cruzada pelo ID. Ausência de cadastro não gera UF fictícia.
- Sem mudança de banco, permissões, valores, provedor, emissão ou cancelamento.

## Manifesto explícito

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-26-nfse-cidade-uf.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-12-versao-4-8-304.md`
- `internal/versioning/system-version.json`
- `modules/gestor/components/GestorModuleContent.tsx`
- `modules/gestor/emissor-nfse/EmissorNfsePage.tsx`
- `modules/gestor/emissor-nfse/dashboard/NfseDashboardCards.tsx`
- `modules/gestor/emissor-nfse/dashboard/nfse-dashboard.css`
- `modules/gestor/gestor.page.tsx`

Total: 11 arquivos.

## Validação

- Ensaio da tela desktop e móvel com lista fora de ordem para verificar vínculo por ID, ausência de título visível, fallback e manutenção dos valores.
- TypeScript, build, regressões focadas e teto de linhas. Nenhum teste emitiu ou cancelou notas.
