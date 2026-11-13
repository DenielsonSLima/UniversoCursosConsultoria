# NFS-e — formulário de Serviços no padrão do sistema

Data: 12/11/2026. Candidato: 4.8.331, revisão 340. Base publicada: 4.8.330 / PR #421.

## Pedido e resultado

O usuário pediu distinguir melhor os modelos de emissão usando NBS e indicador da operação. Após conferir a apresentação local, corrigiu a preferência para uma opção por linha, sem cartões. Pediu também remover o campo de categoria financeira e padronizar a digitação dos valores com duas casas decimais.

A lista vertical mostra o nome e, abaixo, os códigos e as descrições reais da NBS e do indicador da operação. Linhas alternam branco e cinza claro e o resumo termina com ponto final, conforme a conferência local do usuário. A busca inclui esse resumo; o campo fechado conserva o nome. Não há dedução de significado fiscal nem confusão entre indicador e tipo de operação.

O campo Categoria financeira foi removido por inteiro. Novos planos e títulos criados pelo fluxo de Serviços usam a categoria canônica Serviços NFS-e, definida no servidor. A interface não oferece outras categorias nem conserva categoria editável no estado. Categoria canônica ausente/inativa impede a criação, em vez de escolher outra silenciosamente.

Valor do serviço, juros, multa e desconto têm máscara automática com duas casas. Digitação e exclusão seguem o padrão monetário existente; colagem com separador decimal explícito conserva o valor. Por exemplo, 12,5 passa a 12,50 e 1.25 passa a 1,25. Percentuais são enviados em unidades humanas: 1,25% vira 1.25 no contrato, sem multiplicar por cem. Trocar desconto em reais/percentual zera o campo e invalida a prévia. Quantidade de parcelas e antecedência continuam números inteiros.

## Contrato e preservação

- A descrição adicional do seletor e o modo decimal dos termos são opcionais; os demais consumidores mantêm o padrão anterior.
- O servidor determina a categoria na prévia e na gravação de uma nova tentativa; IDs enviados arbitrariamente não alteram essa decisão.
- A mesma tentativa após timeout usa sua própria categoria congelada e conserva token, valores e demais campos. Não depende de uma categoria atual diferente.
- Nenhum plano/título histórico é reclassificado. O vínculo de conta existente mantém suas condições originais.
- Parcelas, vencimentos, juros, multa e desconto continuam calculados no backend; revisão e payload usam a prévia canônica.
- Auth, escopo fiscal, papel/polo e permissão BolePix permanecem exigidos antes da leitura/gravação.

## Validação e operação remota

- Dois testes DOM reais aprovados e reexecutados em revisão independente: lista de modelos, busca, teclado, digitação/exclusão/colagem, categoria ausente, etapas e payload. Nove testes/subtestes funcionais do seletor padrão aprovados.
- Sete testes SQL aprovados: reprodução da categoria arbitrária anterior, normalização, autorização, título após autorização fiscal, conservação das três parcelas, histórico e replay do payload original após falha.
- TypeScript e lint aprovados. Todas as fontes manuais deste manifesto respeitam 500 linhas; índice RAG é artefato gerado.
- Migration 225400 aplicada por MCP após revisão independente. Os quatro corpos remotos correspondem à fonte; RPCs públicas só executáveis por authenticated, helper privado fechado. Três RPCs recusam identidade ausente antes dos dados.
- Nenhum navegador controlado pelo agente. DOM e HTTP não substituem a conferência visual autenticada do usuário no acesso local. Nenhuma emissão fiscal, BolePix, pagamento ou e-mail real foi realizado como teste.

## Fechamento operacional

Os registros das versões já implantadas são atualizados com suas evidências, sem alterar implementação ou migrations aplicadas. O índice RAG local é regenerado uma única vez após a versão final do lote sanitizado, sem embeddings ou envio externo. O registro de fechamento identifica os comprovantes dos lotes anteriores; esta entrada será publicada com o produto e não antecipa o resultado da implantação do candidato.

## Manifesto explícito

Total: 26 arquivos

- `modules/shared/components/InstitutionalSelect.tsx`
- `modules/gestor/emissor-nfse/parceiros/NfsePartnerServiceModal.tsx`
- `modules/gestor/emissor-nfse/parceiros/NfsePartnerFinancialFields.tsx`
- `modules/gestor/emissor-nfse/parceiros/hooks/useNfsePartnerFinancialPlan.ts`
- `modules/gestor/financeiro/outros-creditos/OtherCreditPlanTermsFields.tsx`
- `modules/gestor/emissor-nfse/parceiros/NfseServicePlanPreview.tsx`
- `modules/gestor/emissor-nfse/parceiros/NfsePartnerServiceModal.interaction.test.mjs`
- `modules/gestor/financeiro/outros-creditos/OtherCreditPlanTermsFields.interaction.test.mjs`
- `supabase/migrations/20261112225400_nfse_service_fixed_financial_category.sql`
- `supabase/tests/nfse_service_fixed_category.isolated.test.mjs`
- `.github/workflows/nfse-service-financial.yml`
- `ai/operacao/registros/alteracoes/2026-11-12-parceiro-email-primeiro-acesso.md`
- `ai/operacao/registros/alteracoes/2026-11-12-ead-turmas-quatro-colunas.md`
- `ai/operacao/registros/alteracoes/2026-11-12-nfse-incidente-retorno-automatico-326.md`
- `ai/operacao/registros/alteracoes/2026-11-12-nfse-servicos-recebiveis-bolepix.md`
- `ai/operacao/registros/alteracoes/2026-11-12-caixa-servicos-nfse-pdf-resumido.md`
- `ai/operacao/registros/alteracoes/2026-11-12-nfse-emitidas-colunas-alinhadas.md`
- `ai/operacao/registros/alteracoes/2026-11-12-servicos-receber-padrao-financeiro.md`
- `ai/operacao/registros/alteracoes/2026-11-12-fechamento-publicacoes-emissor-financeiro.md`
- `ai/operacao/registros/alteracoes/2026-11-12-nfse-servicos-formulario-padrao.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-07-versoes-4-8-261-a-262.md`
- `ai/operacao/rag/index.json`
