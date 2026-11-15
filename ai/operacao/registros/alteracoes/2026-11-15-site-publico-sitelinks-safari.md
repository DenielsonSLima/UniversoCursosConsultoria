# Site público: clique do menu no Safari

Data: 15/11/2026. Classificação: correção interativa e publicação.
Status: implementado para entrega 4.8.347; conferência final em andamento.

## Reprodução e aceite

- Durante o smoke real após a publicação 4.8.346, o Safari abria Cursos, mas fechava o disclosure ao clicar em Cursos Técnicos sem navegar para a página.
- O desfoque com relatedTarget nulo pode ocorrer antes do click no Safari; fechar o menu nessa fase retira o alvo antes da ativação.
- Preservar o menu quando o desfoque não identifica outro alvo. Fechar continua funcionando com foco externo conhecido, clique fora, Escape e navegação.
- Validar abertura, clique e destino no Safari real após publicar. Nenhum pedido de confirmação novo: correção necessária ao escopo de navegação já autorizado.

## Implementação e validação

- Patch localizado no onBlur de Header; não altera links, aparência, catálogos, backend ou permissões.
- Regressão reproduz focusout com relatedTarget=null antes do click e exige navegação para /cursos-tecnicos.
- 9/9 testes interativos e lint do Header aprovados; contrato de geração com 7 testes preservado.
- Versão 4.8.347/revisão 356 preparada sobre a 4.8.346. Build completo Node 24.22.1, lint focado, 16/16 testes e teto de 500 linhas aprovados; gates remotos e smoke final no acompanhamento do lote.

## Entrega SEO anterior e Search Console

- PR #436 publicada na 4.8.346, SHA 02bc708c2f8b5a4abc133767111e3d494336fe89; deploy dpl_5NiossZ2n22A6jZQdTXChwehwsT2 READY e aliases oficiais sem erro.
- 14 páginas estáticas públicas HTTP 200 com H1, texto, links e canonical no HTML inicial; sitemap HTTP 200 com 13 URLs canônicas; login/gestor noindex sem snapshot; JS/CSS corretos e aplicação completa iniciou em produção.
- Preview não possui as variáveis de conexão necessárias ao React; essa configuração não foi modificada. Smoke completo foi transferido ao domínio oficial.
- Search Console consultado na propriedade já verificada: registro anterior do sitemap apresentava falha, com leitura antiga.
- Após conferir o XML publicado, o sitemap https://www.universocc.com.br/sitemap.xml foi reenviado pela UI. O Google confirmou “Sitemap enviado” e a tabela registrou envio em 15/11/2026.
- A última leitura e a falha histórica ainda não foram atualizadas; recebimento do envio não foi confundido com leitura bem-sucedida, indexação das páginas ou exibição de sitelinks.
- Os sitelinks continuam sujeitos à escolha e processamento do Google, sem prazo prometido.

## Manifesto explícito

- `modules/public/components/Header.tsx`
- `modules/public/components/public-navigation.interaction.test.mjs`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-09-versao-4-8-280.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-11-15-site-publico-sitelinks-safari.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

Total: 8 arquivos.
