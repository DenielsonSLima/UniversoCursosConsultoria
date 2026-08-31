# Lote ativo

Estado: `CONCLUÍDO`

## Lote: 2026-08-30-recebimentos-na-conciliacao

- Pedido: reaproveitar `Financeiro > Conciliação > Conciliação & Baixas` como
  visão detalhada de recebimentos, sem criar um novo módulo.
- Autorização: implementação, GitHub e produção aprovados explicitamente pelo
  usuário em 30/08/2026.
- Risco: crítico — financeiro, dados pessoais, Supabase/RLS e desempenho.
- Manifesto explícito:
  `ai/operacao/registros/alteracoes/2026-08-30-recebimentos-detalhados-na-conciliacao.md`.

### Escopo aprovado

1. Listar na mesma tela baixas automáticas Banese, manuais e histórico migrado.
2. Exibir cada cobrança em duas faixas: identidade do título e detalhes da baixa.
3. Incluir pagador com CPF mascarado, data/hora disponível, valores, ajustes,
   origem, forma, conta mascarada e responsável.
4. Adicionar filtros server-side por período, origem, empresa, polo e busca,
   mantendo paginação estável.
5. Não criar nova rotina de baixa, não alterar títulos e não inventar hora ou
   composição financeira ausente.

### Diagnóstico confirmado

- Produção contém 263 recebimentos: 48 automáticos Banese, 26 manuais e 189
  históricos migrados.
- A consulta atual restringe `gateway_provider = banese_card`, por isso enxerga
  somente os 48 automáticos e uma baixa manual ligada a título Banese.
- Hora canônica de registro existe para os 48 automáticos e 26 manuais; o
  histórico possui somente `data_pagamento`.
- A composição é explícita nas 26 baixas manuais; diferenças não comprovadas
  precisam permanecer identificadas como não discriminadas.
- O polo selecionado não participa da query atual.

### Aceite

- A visão `Pago` cobre os 263 recebimentos sem duplicar ou alterar baixas.
- CPF e conta saem mascarados do banco e o payload não contém dados bancários
  sensíveis nem evidências brutas.
- Gestor sem Financeiro/A Receber é negado; gestor local só acessa polo
  autorizado; escopo global é explícito.
- Período usa a data da baixa e a hora usa somente timestamp canônico de
  registro. Histórico mostra `horário não disponível`.
- Paginação, busca, origem, empresa e polo são aplicados no servidor.
- Desktop mostra duas faixas agrupadas e mobile usa cartão equivalente.
- Testes focados, contratos de segurança, TypeScript, build e limite de linhas
  passam antes do pedido de publicação.

### Implementação e validação local

- A visão abre em Pago e usa a RPC paginada e protegida para cobrir os 263
  recebimentos, com filtros server-side e duas faixas por cobrança.
- O histórico migrado permanece separado e sem hora ou componentes inventados.
- CPF/CNPJ revela somente os dois últimos dígitos; busca documental exige o
  documento completo; comprovantes manuais/históricos não reutilizam links de
  gateways antigos.
- A origem bancária exige evidência de liquidação, e o feed separa
  `production`/`sandbox` sem excluir baixas manuais ou histórico canônico.
- A consulta medida contra o schema real levou cerca de 30 ms para uma página
  de 20 itens e usou o índice existente.
- Os 48 testes do domínio, ESLint, TypeScript, build de produção e limite de
  linhas passaram.
- A migration foi aplicada em produção como `20260831010512`; a RPC real
  confirmou 263 recebimentos, sendo 48 Banese, 26 manuais e 189 históricos.
- ACL remota confirmada: execução apenas por `authenticated`; `PUBLIC`, `anon`
  e `service_role` permanecem revogados. A negação sem identidade e para polo
  fora do escopo também foi exercitada em produção.
- O advisor sinaliza somente o uso intencional de `SECURITY DEFINER` por usuário
  autenticado; a função mantém `search_path` vazio e guardas internas de módulo,
  aba e polo.
- Publicação versionada como `4.8.14` no `main`, com deploy de produção e checks
  remotos acompanhados no fechamento.
- Smoke visual autenticado permanece pendente se o navegador conectado continuar
  indisponível; o contrato remoto, filtros, payload, tipos e build foram validados.
