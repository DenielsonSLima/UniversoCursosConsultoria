# Alteração — padrão institucional do calendário de aulas

- Lote: `2026-08-07-correcao-calendario-padrao-documental`
- Estado no fechamento local: `PRONTO_PARA_VALIDACAO`
- Escopo: prévia do modelo, renderer A4 canônico e payload autorizado da exportação de calendário.
- Não alterado: regras da grade acadêmica, dados de turma, outros modelos documentais e publicação GitHub/Vercel.

## Resultado

- A prévia agora reutiliza `DocumentHeader` com os dados institucionais e a marca-d’água gráfica configurada.
- O PDF canônico recebe cabeçalho completo (logo, identificação da unidade, CNPJ, contato e endereço) da RPC autorizada, repetido em cada página.
- A marca é um recurso isolado no fundo da página; as linhas da grade são transparentes para mantê-la visível, enquanto títulos, tabela e rodapé permanecem vetoriais e selecionáveis.
- Prévia, download e impressão continuam consumindo o mesmo Blob já preparado pelo painel de exportação.
- A miniatura passou a montar a A4 de `794 × 1123` antes de reduzir toda a página com a mesma escala. Logo, cabeçalho, contatos, selo e tabela mantêm a proporção da Declaração e do Contrato, sem se sobrepor em um painel estreito.

## Banco e segurança

- A migration `20260807142446_align_calendario_institutional_branding` foi aplicada pelo MCP Supabase e confirmada na lista remota de migrations.
- A RPC preserva autorização por polo/modalidade/turma, `SECURITY DEFINER`, `search_path` vazio e os grants existentes.
- URLs externas só são resolvidas pelo compositor quando pertencem ao Storage HTTPS oficial; data URIs de imagem permanecem compatíveis com a configuração institucional existente.

## Evidências

- `deno test --allow-read --allow-write --allow-env modules/gestor/calendario/exportacao-aulas/calendarioAulasExportacao.test.ts`: 6/6 aprovados.
- `npm run test:pdf-exports`: aprovado, sem rasterização direta de página inteira.
- ESLint focado dos arquivos alterados: aprovado.
- `npm run build`: aprovado.
- Inspeção do A4 renderizado: duas páginas A4, texto extraível e apenas recursos isolados de logo/marca; nenhuma imagem A4 foi embutida.
- A captura do calendário que apontou a falha foi comparada ao canvas de Declaração: o primeiro desenhava o cabeçalho no painel estreito, enquanto o segundo desenha uma A4 de largura fixa. O editor foi alinhado ao segundo comportamento.

## Limite conhecido

Não havia browser controlável disponível nesta sessão para abrir a prévia autenticada. A tentativa de conexão não encontrou nenhuma janela exposta. A validação visual foi feita sobre o Blob PDF real e pela equivalência dimensional com os canvases de Declaração/Contrato.

O índice RAG versionado foi refeito com sucesso. A sincronização do cache opcional OpenContext ficou pendente porque o ambiente negou escrita no diretório pessoal dele; isso não afeta a fonte versionada em `ai/operacao/`.
