# Seletor personalizado de faculdades em Convênios — 2026-09-27

## Objetivo

Substituir o menu nativo do navegador no cadastro de Convênio por um combobox próprio, digitável e coerente com os seletores personalizados do Financeiro.

## Manifesto explícito

Total: 9 arquivos

- `modules/gestor/financeiro/convenios/components/ConvenioFaculdadePicker.tsx`
- `modules/gestor/financeiro/convenios/components/ConvenioFormModal.tsx`
- `modules/gestor/financeiro/convenios/convenios-ui.contract.test.ts`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/alteracoes/2026-09-27-convenios-seletor-personalizado.md`

## Contrato entregue

- O campo Faculdade parceira aceita digitação apenas para busca; a criação continua usando o ID canônico da PJ selecionada.
- Clicar ou focar o campo com busca vazia lista todas as faculdades autorizadas.
- O painel próprio mostra nome e CNPJ, rolagem interna, estados vazio/carregando/erro, clique externo e navegação por teclado.
- O componente não usa `<select>` nativo e preserva Anhanguera e Unopar como as opções retornadas pela regra financeira vigente.
- A migração dos demais seletores nativos não faz parte deste lote e ocorrerá gradualmente.

## Skill complementar

- A skill pessoal `universo-seletores-personalizados` foi instalada fora do repositório para orientar ajustes futuros sem ampliar este hotfix.

## Validação

- 23 contratos de Convênios aprovados.
- TypeScript sem erros.
- Lint focado sem erros.
- Smoke autenticado de produção deve confirmar clique vazio, busca e seleção após a publicação.
