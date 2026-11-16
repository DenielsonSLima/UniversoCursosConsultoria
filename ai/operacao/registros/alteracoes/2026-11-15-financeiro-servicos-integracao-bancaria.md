# Financeiro: Serviços e coerência da integração bancária

Data: 15/11/2026. Classificação: mudança crítica de financeiro e publicação.
Status: etapas 1 e 2 implementadas; validação local e revisão independentes aprovadas, fechamento para publicação 4.8.348.

## Pedido e aceite

- Autorização explícita nesta conversa: corrigir primeiro Serviços, depois os demais achados bancários, dividir entre três agentes, testar localmente com dados fictícios, revisar e publicar em produção.
- Preservar a operação atual: produção ativa, Banese BOLETO em EAD/Técnico/Outros Créditos, BolePix no mesmo título, matriz recebedora e polo de origem separado. Sem emitir, cancelar ou baixar títulos reais no teste.
- Serviços: alternar modalidades sem apagar valores disponíveis, perder filtros ou recriar canal; eventos e reconexão continuam atualizando automaticamente, com isolamento por polo.
- Configuração bancária: seletores e estados refletem o backend, controles simétricos para rotas homologadas e integração, sem liberar Pix avulso, cartão ou modalidades não homologadas.
- Dependência preparada deve respeitar configuração vigente antes do primeiro POST; títulos existentes mantêm consulta e recuperação pelo ambiente original.

## Etapas e validação

1. Serviços: agente 1 implementa cache e ciclo do workspace; agente 3 valida interação com dados fictícios e revisa; root confere antes da etapa 2.
2. Integração: agente 2 implementa guardas e migrations mínimas; root ajusta apresentação; revisão cruzada e testes negativos preservam a operação corrente.
3. Fechamento: manifesto explícito, lint focado, build, teto500, preview GitHub/Vercel, aplicação via MCP e smoke Safari proporcional.

### Etapa 1 conferida

- Workspace Serviços conserva hook/canal após a primeira visita; consultas ficam pausadas e UI/modais/portal saem da árvore quando outra modalidade está visível. Troca de polo remonta com chave própria.
- Cache usa política compartilhada de 5 minutos/30 minutos; cartões mantêm dados durante background fetch; animação de entrada não repete; invalidação pós-recebimento não repete raiz e subchave sobrepostas.
- Quatro testes de interação aprovados com dados fictícios: alternância real de modalidades, eventos durante a aba oculta, reconexão, isolamento de polo, preservação de filtros/cards/grupos e confirmação fictícia com uma leitura após invalidação.
- Revisão independente identificou risco ao atrasar prefetch das contas. Corrigido antes da entrega: contas continuam pré-carregadas com Serviços visível, preservando a seleção automática e o preview do modal real.
- Lint focado e compilação isolada aprovados. Regras/RPCs/payloads financeiros preservados.

### Etapa 2 conferida

- Resumo exibe todas as modalidades e conserva a seleção; ambiente global e ambiente de edição são identificados separadamente. Textos de homologação antigos foram substituídos pelo estado efetivo; BolePix permanece na rota BOLETO, Pix avulso e cartão seguem bloqueados.
- API permite desligar produção sem exigir emissor/rota prontos; ao ativar exige matriz ativa, rota homologada e credencial do mesmo ambiente. Técnico pode reativar somente BOLETO/Banese em produção, sem liberar Livre, Especialização, Pix avulso ou Mercado Pago.
- Overview foi extraído sem mudar o contrato; index permanece abaixo de 500 linhas. Deploy de API preserva todos os arquivos publicados fora de index/config/overview/runtime, evitando atualizar adapter compartilhado incidentalmente.
- Guarda SQL de dependência executa somente no início de tentativa sem identidade remota e no primeiro intent de POST; configuração é conferida sob locks. Reuso, GET, persistência de retorno e ambiente de título já existente são preservados.
- Migration Realtime publica as três tabelas de configuração ausentes, mantendo RLS/grants e todos os dados de configuração.
- Testes locais: 54 regras de backend, 11 cenários SQL em PGlite isolado e 5 interações de Serviços/Integração. Dados fictícios, sem rede bancária. Build Node 24.22.1, TypeScript global e lint focado aprovados.
- Smoke Safari local em 127.0.0.1: Serviços/Técnico/Serviços conserva filtro/cards/valores, contador de consultas e um canal; Técnico/Resumo bancário conserva a modalidade. Todos os controles do harness usam apenas memória fictícia.

### Ajuste restrito da validação remota

- Primeiro candidato passou 15 de 16 workflows; Qualidade do produto, Configurações e Serviços aprovaram teto500, preservação de migrations, TypeScript, lint, testes e build.
- EAD por confiança falhou em fixtures que gravavam CURRENT_DATE UTC no dia 16 enquanto a regra real compara com o dia civil de Maceió, ainda 15 entre 00h e 03h UTC. Base e candidato possuem os mesmos arquivos de produto EAD; não era regressão financeira do lote.
- Somente duas inicializações de fixtures PGlite receberam SET TIME ZONE America/Maceio. Código/owner de produto, migrations e dados reais não mudaram. Testes PostgreSQL concorrentes já usavam esse fuso.
- A suíte completa passou 49/49 com PGlite 0.5.8, versão exata do CI, sem wrapper; lint aprovado. Candidato final recomposto em um commit para nova conferência remota.

## Estado anterior comprovado

- GitHub main/produção: 4.8.347, commit `2c387bdf19b422346fa2e7d1f40e1785b4785e13`.
- Função de configuração v35: index/config/issuer coincidem com os arquivos locais conferidos; bundle compartilhada publicada diverge de partes locais, portanto eventual deploy preservará dependências remotas fora do patch.
- Função dependência v14: handler coincide com local; sua bundle usa adapter anterior. Evitar republicação incidental de parsers, PDF e contrato bancário.
- Somente runtime está na publication Realtime entre as tabelas assinadas pela configuração.
- Fingerprints de runtime, rotas, emissor e credenciais capturados para comparação após entrega. Não há segredos ou dados pessoais no registro.

## Manifesto explícito

- `modules/gestor/financeiro/receber/ReceberTab.tsx`
- `modules/gestor/financeiro/receber/servicos/useServicosReceber.ts`
- `modules/gestor/financeiro/receber/servicos/ServicosReceberTab.tsx`
- `modules/gestor/financeiro/receber/servicos/ServiceReceivablesToolbar.tsx`
- `modules/gestor/financeiro/receber/servicos/ServicosReceberCache.interaction.test.mjs`
- `modules/gestor/financeiro/receber/servicos/service-receivables.fixture.mjs`
- `modules/gestor/configuracoes/integracao-bancaria/IntegracaoBancariaConfig.tsx`
- `modules/gestor/configuracoes/integracao-bancaria/ResumoBancarioPanel.tsx`
- `modules/gestor/configuracoes/integracao-bancaria/RotasBancariasPanel.tsx`
- `modules/gestor/configuracoes/integracao-bancaria/integracao-bancaria.ui.tsx`
- `modules/gestor/configuracoes/integracao-bancaria/integracao-bancaria.policy.ts`
- `modules/gestor/configuracoes/integracao-bancaria/useIntegracaoBancariaRealtime.ts`
- `modules/gestor/configuracoes/integracao-bancaria/integracao-bancaria.fixture.mjs`
- `modules/gestor/configuracoes/integracao-bancaria/integracao-bancaria.interaction.test.mjs`
- `supabase/functions/gateways/api/index.ts`
- `supabase/functions/gateways/api/config.ts`
- `supabase/functions/gateways/api/config.test.ts`
- `supabase/functions/gateways/api/overview.ts`
- `supabase/functions/gateways/api/runtime.ts`
- `supabase/functions/gateways/api/runtime.test.ts`
- `supabase/migrations/20261116023513_guard_dependency_banese_creation_configuration.sql`
- `supabase/migrations/20261116023516_publish_payment_gateway_configuration_realtime.sql`
- `supabase/tests/payment_gateway_configuration.isolated.test.mjs`
- `supabase/tests/ead_trust_payment.fixture.mjs`
- `supabase/tests/ead_trust_certificate.fixture.mjs`
- `.github/workflows/configuracoes-regressions.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-10-versao-4-8-281.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-11-15-financeiro-servicos-integracao-bancaria.md`

Total: 32 arquivos.

## Limitações e preservação

- Migrations aplicadas via MCP em produção: `20261116023513` e `20261116023516`. Fontes receberam o prefixo efetivo do ledger sem mudar o SQL aplicado; nenhum dado de configuração foi alterado.
- API `payment-gateway-api` v36 publicada com JWT mantido. Pacote preservou 86 arquivos e substituiu/adicionou somente os quatro overlays revisados. Emissor, runtime, rotas e credenciais mantiveram fingerprints idênticos após migrations.

- Nenhuma chamada bancária real será usada como teste fictício; nenhuma alteração das configurações financeiras atuais faz parte do lote.
- Trabalho paralelo de parceiro PF e demais arquivos fora do manifesto permanece preservado.
- O manifesto será fechado após as etapas, antes de qualquer publicação.
- Os 32 arquivos do lote estão abaixo de 500 linhas. A checagem global local encontra 14 fontes históricas ausentes neste checkout antigo, existentes na base remota; não foram reconstruídas nem incluídas incidentalmente. O gate remoto definitivo sobre main passou.
- Deno check da bundle remota preservada e da candidata retorna as mesmas três falhas preexistentes: duas dependências type-only omitidas pela recuperação do pacote e um campo signal em contrato remoto legado. Nenhum novo erro foi introduzido; não houve atualização incidental de parsers ou adapters para contornar isso.
