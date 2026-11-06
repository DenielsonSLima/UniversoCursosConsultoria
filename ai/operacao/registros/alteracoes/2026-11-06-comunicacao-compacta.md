# Comunicação compacta — etapa 5 de 5

## Objetivo e aceite

Após validar Calendário, compactar Atendimento, Atrasados, Notificações e Push, Automações, Fluxos, Agentes, Atendimento por polo e Canais e perfis. Preservar regras, consultas, permissões, configurações e todas as ações de envio. Validar navegação e apresentação com dados sintéticos, sem transmitir mensagens ou ativar automações.

## Manifesto explícito

- `modules/gestor/comunicacao/UnifiedCommunicationPage.tsx`
- `modules/gestor/comunicacao/ComunicacaoPage.tsx`
- `modules/gestor/comunicacao/InternalCommunicationPage.tsx`
- `modules/gestor/comunicacao/InternalCommunicationView.tsx`
- `modules/gestor/comunicacao/comunicacao-workspace.css`
- `modules/gestor/comunicacao/comunicacao-framing.css`
- `modules/gestor/comunicacao/comunicacao-mobile.css`
- `modules/gestor/comunicacao/multicanal/MultichannelOperationsPage.tsx`
- `modules/gestor/comunicacao/notificacoes-push/NotificacoesPushPage.tsx`
- `modules/gestor/comunicacao/atendimento-config/AtendimentoConfigPage.tsx`
- `modules/gestor/comunicacao/automacoes-multicanal/AutomacoesMulticanalPage.tsx`
- `modules/gestor/comunicacao/automacoes-multicanal/MultichannelAutomationsPanel.tsx`
- `modules/gestor/comunicacao/comunicacao-operations.css`
- `ai/operacao/registros/alteracoes/2026-11-06-comunicacao-compacta.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

Total: 16 arquivos.

## Coordenação e risco

Três agentes: atendimento e moldura WhatsApp; entradas multicanal, push e atendimento por polo; harness e revisão independente. ComunicacaoPage foi dividido em dispatcher público, controlador interno e View pura para cumprir o teto de 500 linhas. Handlers e hooks foram preservados. O smoke usa somente dados sintéticos e bloqueia gravações e envios.

## Validação

Concluída. TypeScript integrado e 28 testes focados de filas, categorias, seleção, realtime e multicanal aprovados. Revisão independente confirmou hooks, efeitos, handlers, dispatcher, dirty state e transporte das 30 props equivalentes à base 4.8.249. Vinte montagens SSR reais passaram sem I/O.

Smoke Safari desktop das oito entradas: fila aberta/finalizada e detalhe do Portal/App, rascunho e revisão de Push (12 alunos/15 aparelhos sintéticos), troca de polo e modo local sem salvar, expansão de automação sem editar/ativar, Fluxos e Perfil com linha Meta sintética. Perfil sem canais mostrou fila vazia e nenhum canal disponível.

Smoke em 390 px identificou e corrigiu o acesso à lista, a rolagem até o detalhe e a largura de mensagens/compositor; reteste mostrou todas as ações e texto legíveis. Cabeçalho WhatsApp com ações quebradas em linhas, Fluxos e Perfil sem corte. Ícones e selos de Agentes retestados no desktop e celular.

Nenhum envio, marcação como lida, gravação de configuração, upload, QR, ativação de fluxo ou automação foi permitido. A confirmação de Push foi aberta e fechada por Voltar e revisar. A revisão não executa o despacho futuro de Atrasados/Agentes, que já está pendente na versão base.
