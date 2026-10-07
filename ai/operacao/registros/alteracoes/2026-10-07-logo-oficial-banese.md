# Restauração da logo oficial Banese

Data: 2026-10-07
Versão: 4.8.178, revisão 187
Estado: correção e validação local concluídas; CI, Preview e implantação em conferência.

## Objetivo e causa

Restaurar a marca bancária original no boleto e no carnê, sem redesenhar o documento.
A URL sem www da logo responde HTTP 308 para www; os renderizadores mantêm corretamente redirect:error e retornam null nessa situação. O compositor então usava um quadrado e o nome do banco como contingência. Esse desenho genérico já existia no commit 4648ef7, de julho de 2026; a data em que o redirecionamento passou a afetar documentos não foi determinada.

O PNG oficial permanece intacto no projeto desde o commit 3931306a, de 05/07/2026. A correção incorpora os mesmos 11.739 bytes, SHA-256 93dad7dc98fc786f8b31fc1b3322dd06282bfe8cc37250b38a11fa253f97b65d, como reserva local. Nenhuma marca foi redesenhada e nenhuma permissão de rede foi relaxada.

## Escopo e preservação

- Marca Banese oficial obrigatória; removida a contingência gráfica genérica.
- Logo Universo, cabeçalho, posições, três títulos por A4 e paginação preservados.
- Valores, juros, multa, desconto, beneficiário, linha digitável, barcode e QR Pix preservados.
- Nenhuma cobrança real criada, alterada, baixada ou cancelada.
- Os bundles Edge anteriores são a base da implantação: apenas branding.ts muda e o asset Banese é adicionado; outros 19 arquivos do carnê e 17 do boleto permanecem byte a byte.
- JWT permanece habilitado e entrypoints mantidos.
- Base GitHub: 3d38d6255a7b59f40340da9202f561986ec549f6, preservando Caixa 176 e contrato 177.

## Validação

- 28 testes-fonte executados com Node/esbuild e pdf-lib 1.17.1: aprovados. Três testes da reserva falhavam antes do patch e passaram depois.
- Recurso incorporado comparado byte a byte com o PNG oficial do repositório.
- PDF sintético do carnê e boleto renderizado: igualdade de pixels com a versão anterior quando a logo carregava corretamente.
- Texto extraído do carnê idêntico; pdfimages mostra apenas logos e QR isolados, com texto e linhas nativos.
- Revisão independente do patch e dos dois manifestos Edge aprovada.
- Workflow focado executa os mesmos testes com Deno nativo no GitHub, incluindo cheque de tipos; resultado deve ser conferido antes da implantação.
- CI, Preview e releitura pós-implantação serão conferidos na publicação; nenhum resultado pendente é apresentado como aprovado.
- Smoke interativo autenticado do gestor permanece pendente por ausência de sessão reutilizável; nenhuma evidência com dados reais integra o lote.
- Histórico 4.8.91 a 4.8.110 arquivado sem modificar qualquer entrada; controle de versão e preservação das 81 entradas anteriores validados.
- Nenhuma fonte do índice RAG alterada.

## Manifesto explícito

Total: 9 arquivos

- `supabase/functions/banese/internal/assets/banese-logo.ts`
- `supabase/functions/banese/internal/pdf/branding.ts`
- `supabase/functions/banese/internal/pdf/branding.test.ts`
- `.github/workflows/banese-document-branding.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-09-25-a-2026-09-26-versoes-4-8-91-a-4-8-110.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-07-logo-oficial-banese.md`
