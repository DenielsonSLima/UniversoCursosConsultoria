# Hotfix — foto no cadastro individual de Parceiros

## Escopo, base e aceite

Prioridade explícita do usuário: publicar a correção das fotos. Candidato 4.8.258/revisão 267 sobre Secretaria 4.8.257, main 035025ed8cc55e9e660312f72c6691b2500656eb. O responsável comprovou 107/107 blobs da base isolada contra MCP main. Preservadas integralmente as entregas paralelas Carteirinhas 4.8.255, NFS-e 4.8.256 e Secretaria 4.8.257. Comunicação segue adiada pelo usuário; Biblioteca é a próxima etapa após a correção das fotos.

O responsável aprovou o aceite técnico após capturar no Chrome local 3054 os componentes reais AlunoCard e ParceiroAlunoDados. Baseline: foto do card correta e cadastro com imagem quebrada/alt Aluno, reproduzindo o relato; corrigido: mesma imagem sintética local nos dois. Três chamadas fake antes e quatro depois, por resolver também a resposta individual; zero produção. Nenhuma foto real, dados pessoais ou Storage de produção foi acessado para esse smoke.

## Manifesto explícito

- `.github/workflows/lgpd-security.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/alteracoes/2026-11-07-hotfix-foto-cadastro-individual.md`
- `docs/planos/padronizacao-visual-etapas-2026-11-07.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `lib/profile-photo-recovery.test.mjs`
- `lib/profile-photo-recovery.ts`
- `lib/profile-photo-transport.test.ts`
- `lib/profile-photo-transport.ts`
- `modules/gestor/parceiros/components/cards/AlunoCard.tsx`
- `modules/gestor/parceiros/components/cards/PFCard.tsx`
- `modules/gestor/parceiros/components/cards/PartnerCardAvatar.test.mjs`
- `modules/gestor/parceiros/components/cards/PartnerCardAvatar.tsx`
- `modules/gestor/parceiros/components/cards/ProfessorCard.tsx`
- `modules/gestor/parceiros/hooks/useParceirosQueries.photo-cache.test.mjs`
- `modules/gestor/parceiros/hooks/useParceirosQueries.ts`

Total: 19 arquivos. Produto inclui transporte, recuperação privada, avatares, frescor da lista e testes-fonte; operação inclui CI/registro/versão. TMP, imagens sintéticas, harnesses, logs e bundles ficam fora da entrega.

## Causa e correção

O card recebe application/json da lista; o cadastro usa getById().single(), cujo PostgREST responde application/vnd.pgrst.object+json. O resolvedor existente ignorava esse MIME e devolvia profile-photo:// para o img do cadastro. O mesmo adaptador agora aceita explicitamente os dois tipos JSON, com parâmetros e caixa normalizados; nenhuma alternativa pública ou segundo resolvedor foi criado.

A hidratação original permanece: bucket fixo, JWT/apikey da chamada, origem/path exatos, TTL 300, assinatura em lote, signal, separação de sessões e capability pública. HTTP malsucedido, HEAD, tipos não JSON e JSON inválido conservam a resposta; falha/negação de assinatura oculta a referência. Sem mudança de schema, ACL, RLS, Auth, Storage, serviços, upload ou persistência. O impacto compartilhado limita-se ao MIME individual esperado pelos consumidores existentes.

## Evidências

- Regressão primeiro: dez testes existentes aprovados e dois novos falhando, Node exit 1, reproduzindo marker no cadastro e referência sem ocultação após assinatura negada.
- Após o patch: 12/12 testes-fonte; revisão independente sem bloqueio e 3/3 provas TMP de MIME/headers/identidade/TTL, HEAD/erro/nonJSON/malformado e negação/path incorreto. Fetchers sintéticos, sem rede real.
- DOM com Card/Cadastro e getById.single reais comprova antes card assinado/detalhe marker e depois src igual; isso complementa as capturas Chrome do responsável.
- CI lgpd-security.yml mantém os gatilhos de lib/profile-photo* e Parceiros, Node >=24.22.1, esbuild do produto e jsdom temporário/LGPD_JSDOM_PATH. A execução foi ampliada com os testes-fonte de recuperação privada, cache/foco e avatar. quality-gates permanece intocado.
- Rodada integrada sobre main257 com Node 24.22.1: 22/22 testes-fonte, TypeScript completo e ESLint do manifesto exit 0; build de 4531 módulos em 13,89 s, 26 páginas sociais e versão 4.8.258/revisão 267 coerente. Teto de linhas aprovado: 3926 arquivos manuais, 161 exceções/artefatos. Changelog preserva integralmente as entradas 255/256/257 da base. Índice RAG integrado gerado uma vez após congelar o lote: 15 fontes/80 trechos; contrato operacional aprovado.

## Recuperação e apresentação incorporadas

A lista agora fica stale após 240000 ms, com refetchOnMount/refetchOnWindowFocus explícitos e mesmos query keys por polo/global, enabled, gcTime e Realtime. Nenhum interval/polling foi adicionado. Cache com 3 min é reutilizado; remontagem/foco após 4 min renova via consulta existente. Turmas/KPIs permanecem como antes.

Ao falhar uma foto já assinada, o avatar faz no máximo uma recuperação por src original. Helper aceita somente URL da mesma origem e path privado UUID/perfil; usa sessão atual do SDK para createSignedUrl com TTL 300. fetchQuery deduplica apenas em voo, com hash da sessão na chave (nunca token em query keys), retry false/staleTime 0/gcTime 0 e confirmação de sessão antes/depois. Troca de usuário invalida resposta tardia; erro, negação, origem/path divergente ou sessão ausente retorna null. Não há cache persistente de autorização ou cache global por path.

Aluno/Professor/PF usam avatar local: iniciais durante loading/erro, lazy/async e dimensões 40×40; a imagem só aparece depois de completa, sem revelar uma faixa ou alt quebrado. Nova URL fica oculta até load; segundo erro termina em iniciais; resposta antiga/unmount não troca foto nova. Não há ui-avatars externo nesses cards e PJ não foi alterado. Isso não muda o recorte original da fotografia nem garante disponibilidade do servidor.

Testes integrados 22/22: 12 transporte, 4 recuperação, 4 query/cache/foco e 2 avatar. Simulam autorização, sessão, URLs e tempo sem rede. Prova negativa da query com staleInfinity falhou ao remontar após 4 min antes do ajuste; invalidações ativas/inativas e polo/global preservados. Concorrência de lotes >100 e cache de assinatura persistente não foram incluídos.

O fechamento limitado ao MIME e o pedido posterior de avatar tiveram seus índices nos candidatos anteriores. A main avançou por entregas paralelas 255/256/257; a nova base integrada exigiu um novo fechamento e uma única geração RAG final autorizada, após congelar o lote. O CI operacional preexistente também gera o índice antes das verificações. Comunicação foi adiada pelo usuário, sem fundir o candidato isolado; Biblioteca é a próxima etapa após publicação 258.

## Publicação e preservação

Prévia e fixtures são temporárias; somente o manifesto explícito é elegível à publicação. O candidato integrado usa a base isolada main257 comprovada pelo responsável, sem sobrescrever os cinco metadados paralelos do workspace. Nenhuma sincronização ou operação remota foi executada por esta preparação. Publicação será feita pelo responsável via MCP sobre a main reconfirmada.
