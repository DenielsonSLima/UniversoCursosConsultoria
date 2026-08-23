---
name: universo-document-model-fidelity
description: Preservar os modelos configurados em "Modelos Documentos" e as marcas d'água institucionais ao criar, corrigir ou publicar geradores, prévias e PDFs do projeto Universo Cursos. Usar em mudanças de diário, declaração, carteirinha, contrato, certificado, boletim, calendário ou outro documento gerado; não usar para simples upload ou leitura de arquivo estático.
---

# Fidelidade aos modelos de documentos

Impeça que um exportador reconstrua um layout genérico quando o produto já possui um modelo configurável. A configuração salva é parte do contrato do documento, não uma referência visual opcional.

## Antes de alterar o gerador

1. Identifique todos os entrypoints do documento: prévia, download, impressão, emissão e artefato assinado.
2. Localize a origem canônica do modelo em `Modelos Documentos`, incluindo a chave por tipo, modalidade, curso, polo ou empresa e o fallback exibido pelo editor.
3. Localize a configuração de marca d'água e preserve juntos URL, opacidade, escala e rotação.
4. Inventarie capa, contracapa, campos, coordenadas, estilos, imagens isoladas, slots de assinatura, QR, textos e paginação configurados.
5. Compare o editor com o compositor real antes de propor código. Se o editor mostra algo que o PDF ignora, trate isso como defeito bloqueador.

## Contrato de implementação

- Propague o snapshot completo do modelo por frontend, backend/Edge, resolvers de assets e compositor. Não descarte campos silenciosamente em normalizadores.
- Prévia, download e impressão reutilizam o mesmo Blob. O artefato assinado usa o mesmo compositor e o mesmo snapshot congelado.
- Não introduza posições, opacidade, escala, rotação, capa, contracapa ou assinaturas hardcoded quando existir configuração equivalente.
- Um fallback só é permitido quando nenhuma configuração aplicável existe. Ele deve coincidir com o fallback mostrado no editor e ser coberto por teste.
- Preserve o PDF nativo/vetorial. Logo, marca d'água, foto, QR e assinatura podem ser imagens isoladas; uma imagem de página inteira não pode substituir texto, tabelas, linhas ou campos do documento.
- Em documentos assináveis, respeite os slots configurados e verifique a ordem das assinaturas, os registros/evidências e as páginas finais previstas.
- Falhe explicitamente quando um asset obrigatório ou snapshot configurado não puder ser resolvido. Não substitua por um modelo genérico sem aviso.

## Porta de qualidade obrigatória

- Mantenha um teste-fonte que inventarie cada gerador e seus adapters e falhe se o modelo ou os quatro parâmetros da marca d'água não chegarem ao compositor.
- Mantenha contratos que rejeitem recomposição duplicada, layout privado e constantes genéricas que suplantem configuração salva.
- Gere o PDF com dados de teste, extraia o texto, inspecione os recursos e renderize capa, uma página interna, contracapa e páginas de assinatura.
- Compare visualmente as páginas renderizadas com o editor de `Modelos Documentos` e com `Configurações > Marca d'água`.
- Quando houver perfis distintos, faça smoke autenticado no perfil que cria, no que revisa/assina e no que consulta.
- Bloqueie publicação se qualquer entrypoint divergir do modelo, se a marca d'água perder parâmetros ou se o PDF assinado usar outro pipeline.

## Limites

Esta skill não autoriza migrations, alterações de acesso, assinatura jurídica ou publicação. Carregue também as políticas específicas do repositório e obtenha a autorização exigida antes de operações remotas.
