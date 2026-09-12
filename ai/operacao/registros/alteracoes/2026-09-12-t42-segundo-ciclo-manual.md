# T42 — segundo ciclo manual com histórico importado para consulta

Estado: backend aplicado e validado; publicação autorizada — 4.8.41.

## Pedido e aceite

Liberar a emissão manual do segundo ciclo da ENF-T42-INT-MAT apesar do
histórico financeiro do sistema anterior. Preservar trancados e ciclos já
emitidos. Radiologia fica fora da alteração. Nenhum boleto será emitido como teste.

- Estado esperado: 27 elegíveis, seis já emitidos/protegidos, dois trancados.
- Preservar 418 recebíveis, valores, pagamentos, identidade bancária e seis runs.
- Não permitir primeiro ou terceiro ciclo nem repetição do segundo.
- Exigir vencimento individual e ação explícita do operador.

## Implementação

Novo critério interno HISTORICO_IMPORTADO_CONSULTA, ativado exclusivamente
na política T42 com aumento de revisão. A apresentação usa HISTORICO_EXTERNO,
contrato já aceito pelos clientes; o fingerprint conserva o critério interno.
Essa distinção evita aplicar às matrículas antigas as guardas de criação de
novas turmas externas e dispensa alterar flags, valores ou dados acadêmicos.

Somente parcelas SISTEMA_ANTERIOR com origem T42-LEG comprovada, vínculo de
turma e ausência de cicloManual, gateway e transação são histórico consultivo.
Qualquer título diferente ou run existente continua protegido. Trancados e
outros estados acadêmicos impeditivos mantêm a guarda atual.

## Validação

- Migration com assertions atômicas de estados, prévias e preservação por hash.
- Contrato SQL somente leitura para revalidar estados, ciclos inválidos e acesso.
- 30 testes focados aprovados e teto de linhas aprovado.
- Migration MCP `20260912140336` aplicada, ledger remoto confirmado.
- Assertions atômicas: 27 elegíveis, seis protegidos, dois trancados;
  prévias das 27 matrículas e rejeição de ciclos 1/3 para as 35 matrículas.
- Hashes de recebíveis, matrículas, turmas e runs preservados antes/depois.
- Contrato SQL somente leitura passou após aplicação, incluindo acesso negado
  à prévia sem autorização e helpers internos sem grants públicos.
- Radiologia preservou seu estado anterior (sem policy manual); este pedido
  não habilitou sua futura geração nem alterou seus títulos.
- Smoke visual pendente: sessão Safari autenticada localizada, mas a janela
  foi alterada pelo usuário durante as tentativas de abrir o detalhe T42.
- Nenhuma emissão, reemissão, quitação ou alteração de valor.
- Publicação GitHub/produção autorizada em 12/09/2026. Revisão independente sem bloqueadores.
- Base remota 4.8.38 já aceita o critério público HISTORICO_EXTERNO.
- A publicação deriva da main e exclui o PR 134; seus arquivos locais são preservados.
- CI, Preview e produção serão conferidos no PR de entrega.

## Manifesto explícito

- `supabase/migrations/20260912140336_allow_t42_imported_history_manual_cycle2.sql`
- `supabase/tests/t42_manual_cycle2.readonly.sql`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-09-12-t42-segundo-ciclo-manual.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 7 arquivos.
