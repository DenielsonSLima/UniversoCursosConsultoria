# Lote ativo

Estado: DIÁRIOS ACADÊMICOS — HISTÓRICO MIGRADO; PUBLICAÇÃO E SMOKE AUTENTICADO PENDENTES

## Lote: 2026-09-13-diarios-academicos

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-13-diarios-academicos.md`

- Pedido: analisar os DOCX, conferir cronograma e cadastros, migrar aulas/conteúdos/frequências/notas e revisar individualmente.
- Versão preparada: 4.8.54, revisão 63. Somente o manifesto explícito integra a publicação.
- Quatro frentes: coordenação, análise independente de fontes, contrato acadêmico e consulta histórica. Conversão OOXML interna, sem Word ou navegação nos documentos.
- 17 arquivos correspondem a 14 diários únicos: 12 T41 e dois T42. Três cópias idênticas foram deduplicadas por hash.
- Migração histórica concluída por RPC: 14 fontes, 122 aulas documentais, 369 vínculos aluno/diário de 389 ocorrências; 3.218 marcações vinculadas, sendo 3.006 conferidas; 284 notas conferidas e 85 em revisão.
- Onze docentes cadastrados somente com nome; 14 atribuições, sendo 12 T41 e duas T42. Grade T41 regularizada com 27 disciplinas em três períodos PLANEJADO, sem inventar datas de calendário.
- Treze migrations de estrutura/contrato aplicadas e dois registros de ensaio sem efeito persistente. Ensaios SQL completos e replay das 14 fontes passaram; cards históricos validados em T41/T42 com preservação do getter operacional e acesso sem identidade negado.
- Hashes de 67 matrículas e 1.132 cobranças permaneceram idênticos antes e depois. Sem promoção, conclusão, dispensa ou emissão financeira pela importação.
- Pendências: quatro identidades em 20 ocorrências, oito diários com carga divergente e 113 datas em revisão, além das regras de médias/calendário ainda sem resposta. Fontes e valores desconhecidos preservados; fechamento e PDF histórico protegidos.
- Oito testes da UI, TypeScript, build completo e dez renderizações das cinco abas com duas respostas RPC reais passaram. Smoke visual autenticado no Safari pendente de sessão de acesso; publicação do frontend ainda não confirmada.

## Entrega anterior concluída

- 4.8.53: PR147/squash 7312be4227ef4ff6dc8bb0483982dd967a8653ba, CI/Vercel e HTTP200 confirmados. Três workers publicados, 14 execuções naturais HTTP200, incluindo duas recuperações internas de504. A causa da instabilidade externa permanece inconclusiva. Registro: `ai/operacao/registros/alteracoes/2026-09-13-workers-configuracao-resiliente.md`.
- 4.8.52: PR146/squash b2b11a5c, CI/Vercel e HTTP200 confirmados. Smoke autenticado em produção confirmou Configurações, cinco abas Proesc, Caixa/linha laranja, Recebíveis e filtros Proesc/Banese. Registro: `ai/operacao/registros/alteracoes/2026-09-12-consulta-api-proesc-banese.md`.
- A conferência financeira residual e o EDI7 ausente continuam descritos nos registros anteriores; este lote não modifica esses estados.
