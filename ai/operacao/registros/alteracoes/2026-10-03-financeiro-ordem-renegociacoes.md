# Financeiro — Renegociações após A Pagar

## Escopo e autorização

Em 03/10/2026 o usuário aceitou a publicação isolada da posição da aba, após a
oferta explícita de deixar a efetivação bancária pendente. Base: main
`2560f4b70567687ad62baddcc9b97ba7490ea273` (4.8.159/revisão 168).
Esta entrega 4.8.160/revisão 169 contém somente a ordem de navegação e seus testes.
O PR 249 de efetivação permanece separado e draft; requer nova versão/rebase antes
de futura publicação. Não houve deploy Supabase nem operação bancária neste lote.

## Aceite

- Ordem: Resumo, A Receber, A Pagar, Renegociações, demais abas e Conciliação final.
- Preservar visual, rolagem, permissões, conteúdo e links financeiros existentes.
- Não publicar a nova efetivação de acordos nem contornar seu bloqueio de deploy.

## Manifesto explícito

Total: 6 arquivos.

- `modules/gestor/financeiro/FinanceiroPage.tsx`
- `modules/gestor/financeiro/financeiro-sections.test.ts`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-03-financeiro-ordem-renegociacoes.md`

## Validação e publicação

- Reprodução com fontes da main em diretório descartável: somente o teste da ordem
  nova falhou antes do patch; após mover a aba, os cinco testes passaram.
- Mudança de implementação restrita à troca de posição de duas entradas.
- Versionamento e registro de manifestos preparados sobre a main; histórico anterior
  preservado. Alterações locais do lote bancário e de outros trabalhos não entram.
- Os seis arquivos do manifesto estão até 500 linhas. A checagem global local
  mantém as 14 ausências preexistentes de outros lotes; não foram corrigidas ou
  omitidas nesta entrega. A CI na base remota limpa conferirá o manifesto
  completo, TypeScript, lint, testes e build antes da promoção.
- Smoke visual autenticado permanece dispensado pelo usuário; teste-fonte e
  verificação HTTP não serão descritos como validação visual em navegador.
- Produção autorizada, condicionada à CI e à verificação do domínio principal.
  A Preview não será apresentada como produção.
- Sem mudanças em fontes do corpus RAG, AGENTS, memória ou lote Proesc.
