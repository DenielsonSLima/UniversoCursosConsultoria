# Pix nas duas vias e cópia no financeiro do aluno

## Pedido, aceite e autorização

Usuário pediu Pix Copia e Cola maior nas duas vias e botão Copiar Pix no
financeiro do aluno. Após ver a imagem do compositor nativo com dados de teste,
aprovou o resultado e solicitou explicitamente atualizar a produção.
Navegador permanece fora do fluxo por orientação do usuário.

## Implementação

- Compositor nativo: mesmo código oficial nas duas vias, fonte de 6,4 pt,
  título de 7,5 pt, caixa verde e texto selecionável sem truncar instruções.
- Financeiro EAD: Copiar Pix ao lado de Abrir, com clipboard e toast existentes.
- RPC: somente código persistido do próprio recebível EAD autorizado, com par
  completo, título aberto, sem data/valor pago e estado bancário pagável explícito.
- Estado desconhecido, pago/parcial, cancelado ou par incompleto oculta o código.
- Autorização por aluno/EAD/polo, histórico Técnico e totais foram preservados.
  Nenhuma emissão, recuperação bancária, cancelamento ou cálculo novo.

## Isolamento da publicação

Snapshot em `/private/tmp/universo-pix-release` reconstruído de main
`a53f9990aaee88de07274a8d78a6fa54746ed093` (4.8.323), com 7.829 blobs
conferidos pelo SHA GitHub. Somente os trechos deste manifesto foram aplicados.
Versão 4.8.325; 4.8.324 estava reservada ao candidato paralelo de serviços NFS-e.
O checkout compartilhado preserva esse candidato, inclusive sua versão e lote
ativo; a versão, changelog, lote e RAG publicados vêm do snapshot isolado.
A entrada antiga 4.8.254 foi arquivada integralmente para respeitar 500 linhas.

## Validação e entrega de backend

- Regressão original reproduzida antes do patch. No snapshot: dez testes de PDF
  com typecheck, sete React e contrato PostgreSQL isolado (PGlite) aprovados.
- PDF A4 renderizado com texto integral nas duas vias e apenas logos/QR como
  imagens. Os dois QR renderizados foram decodificados com conteúdo idêntico.
- Build completo com Node24.22.1 e TypeScript aprovados; ESLint focado passou.
- Migration aplicada via MCP: `20261113002346_partner_ead_pix_copy.sql`.
  Nome local sincronizado ao ledger remoto, sem modificar o SQL aplicado.
- Edge `banese-boleto-document` v25 ACTIVE/JWT. Bundle anterior preservado,
  alterando somente o compositor; guarda de autorização já publicada preservada.
- Contrato remoto com identidade institucional existente: seis linhas consultadas,
  cinco Pix disponíveis, zero exposição em estado pago/incompatível e anônimo negado.
- CI cobre PDF, projeção SQL e botão. Preview e CI controlam a integração do site;
  o estado final de publicação e commit ficam associados à PR desta entrega.
- Tela e abertura autenticada do PDF sem smoke em navegador por pedido do usuário.
  A aba reflete o último snapshot da consulta; pagamento novo aparece no refetch.
- Nenhuma alteração de registros financeiros reais. Artefatos em tmp não versionados.

## Manifesto explícito

- `.github/workflows/banese-document-branding.yml`
- `.github/workflows/student-banese-finance.yml`
- `supabase/functions/banese/internal/boletos/boleto-layout.ts`
- `supabase/functions/banese/internal/boletos/boleto-pix-copy.test.ts`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoFinanceiro.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/EadPixCopyButton.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/parceiro-aluno-financeiro.service.ts`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoFinanceiro.test.mjs`
- `supabase/migrations/20261113002346_partner_ead_pix_copy.sql`
- `supabase/tests/partner_ead_pix_copy.pglite.mjs`
- `ai/operacao/registros/alteracoes/2026-11-12-pix-duas-vias-copia-parceiro.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/rag/index.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-07-versao-4-8-254.md`

Total: 17 arquivos.

O manifesto descreve o snapshot de publicação, não autoriza incluir diferenças
paralelas do checkout compartilhado nos arquivos de mesmo nome.
