#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ragDirectory = resolve(root, 'ai/operacao/rag');
const manifestPath = resolve(ragDirectory, 'manifesto.json');
const indexPath = resolve(ragDirectory, 'index.json');
const embeddingsPath = resolve(ragDirectory, 'embeddings.json');
const DEFAULT_LIMIT = 2;
const MAX_CHUNK_SIZE = 1_200;
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_BATCH_SIZE = 64;

const toProjectPath = (absolutePath) => relative(root, absolutePath).split(sep).join('/');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const normalize = (value) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();
const tokenize = (value) => normalize(value).split(/\s+/).filter((token) => token.length > 1);

const printHelp = () => {
  console.log(`Uso:
  node scripts/agent-memory-rag.mjs index
  node scripts/agent-memory-rag.mjs search "termos da demanda" [--limit 2] [--json] [--semantic]
  node scripts/agent-memory-rag.mjs status
  node scripts/agent-memory-rag.mjs embed

O corpus é definido por ai/operacao/rag/manifesto.json. O índice e os vetores são cache local.`);
};

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

const walkDirectory = async (directory, recursive, extensions, excludedPaths) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const absolutePath = resolve(directory, entry.name);
    const projectPath = toProjectPath(absolutePath);
    if (excludedPaths.has(projectPath)) continue;
    if (entry.isDirectory()) {
      if (recursive) results.push(...await walkDirectory(absolutePath, true, extensions, excludedPaths));
      continue;
    }
    if (entry.isFile() && extensions.has(extname(entry.name))) results.push(absolutePath);
  }
  return results;
};

const collectSources = async () => {
  const manifest = await readJson(manifestPath);
  const extensions = new Set(manifest.includeExtensions ?? ['.md']);
  const excludedPaths = new Set(manifest.excludePaths ?? []);
  const filePaths = new Set();
  for (const source of manifest.sources ?? []) {
    const absolutePath = resolve(root, source.path);
    if (!existsSync(absolutePath)) {
      throw new Error(`Fonte RAG ausente: ${source.path}`);
    }
    const metadata = await stat(absolutePath);
    if (metadata.isDirectory()) {
      for (const foundPath of await walkDirectory(absolutePath, Boolean(source.recursive), extensions, excludedPaths)) {
        filePaths.add(foundPath);
      }
    } else if (extensions.has(extname(absolutePath)) && !excludedPaths.has(source.path)) {
      filePaths.add(absolutePath);
    }
  }
  const sources = await Promise.all([...filePaths].sort().map(async (absolutePath) => {
    const content = await readFile(absolutePath, 'utf8');
    return { path: toProjectPath(absolutePath), content, hash: sha256(content) };
  }));
  return { manifest, sources };
};

const splitLongText = (text) => {
  if (text.length <= MAX_CHUNK_SIZE) return [text];
  const words = text.split(/\s+/);
  const pieces = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > MAX_CHUNK_SIZE && current) {
      pieces.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) pieces.push(current);
  return pieces;
};

const chunkMarkdown = (path, content) => {
  const chunks = [];
  let section = 'Documento';
  let paragraph = [];
  const flush = () => {
    const text = paragraph.join(' ').replace(/\s+/g, ' ').trim();
    paragraph = [];
    if (!text) return;
    splitLongText(text).forEach((piece, part) => {
      const hash = sha256(`${path}\n${section}\n${piece}`);
      chunks.push({
        id: hash.slice(0, 20),
        hash,
        path,
        section,
        text: piece,
        normalizedText: normalize(piece),
        tokenCount: tokenize(piece).length,
        part: part + 1,
      });
    });
  };

  content.split(/\r?\n/).forEach((line) => {
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      flush();
      section = heading[1].trim();
      return;
    }
    if (!line.trim()) {
      flush();
      return;
    }
    paragraph.push(line.trim());
  });
  flush();
  return chunks;
};

const sourceSignature = (sources) => sha256(sources
  .map((source) => `${source.path}:${source.hash}`)
  .sort()
  .join('\n'));

const buildIndex = async () => {
  const { manifest, sources } = await collectSources();
  const chunks = sources.flatMap((source) => chunkMarkdown(source.path, source.content));
  const index = {
    schemaVersion: 1,
    retrieval: 'lexical-bm25-with-source-citations',
    builtAt: new Date().toISOString(),
    manifestVersion: manifest.version,
    sourceSignature: sourceSignature(sources),
    sources: sources.map(({ path, hash }) => ({ path, hash })),
    chunks,
  };
  await mkdir(ragDirectory, { recursive: true });
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  console.log(`Índice RAG criado: ${sources.length} fontes, ${chunks.length} trechos.`);
  return index;
};

const indexIsCurrent = async (index) => {
  const { sources } = await collectSources();
  return index.sourceSignature === sourceSignature(sources);
};

const loadIndex = async () => {
  if (!existsSync(indexPath)) {
    throw new Error('Índice RAG ausente. Execute o comando index no fechamento de um lote relevante.');
  }
  return readJson(indexPath);
};

const buildDocumentFrequency = (chunks) => {
  const frequency = new Map();
  chunks.forEach((chunk) => {
    new Set(tokenize(chunk.text)).forEach((token) => {
      frequency.set(token, (frequency.get(token) ?? 0) + 1);
    });
  });
  return frequency;
};

const sourceWeight = (path) => {
  if (path === 'ai/operacao/MEMORIA_CANONICA.md') return 1.35;
  if (path === 'AGENTS.md') return 1.2;
  if (path === 'ai/operacao/PROTOCOLO_DE_LOTES.md') return 1.15;
  // Registros preservam evidências de lotes, mas não devem suplantar regras duráveis.
  if (path.startsWith('ai/operacao/registros/')) return 0.65;
  return 1;
};

const cosineSimilarity = (left, right) => {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
};

const createEmbedding = async (inputs) => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY não está configurada. A busca lexical continua disponível; configure a chave fora do repositório para embeddings semânticos.');
  }
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: inputs }),
  });
  if (!response.ok) {
    throw new Error(`Falha ao gerar embeddings: HTTP ${response.status}.`);
  }
  const payload = await response.json();
  return payload.data.map((entry) => entry.embedding);
};

const buildEmbeddings = async () => {
  const index = await loadIndex();
  const existing = existsSync(embeddingsPath) ? await readJson(embeddingsPath) : null;
  const existingById = new Map((existing?.vectors ?? []).map((vector) => [vector.id, vector]));
  const pending = index.chunks.filter((chunk) => existingById.get(chunk.id)?.hash !== chunk.hash);
  for (let start = 0; start < pending.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = pending.slice(start, start + EMBEDDING_BATCH_SIZE);
    const values = await createEmbedding(batch.map((chunk) => chunk.text));
    batch.forEach((chunk, offset) => {
      existingById.set(chunk.id, { id: chunk.id, hash: chunk.hash, values: values[offset] });
    });
    console.log(`Embeddings: ${Math.min(start + batch.length, pending.length)}/${pending.length} trechos atualizados.`);
  }
  const vectors = index.chunks.map((chunk) => existingById.get(chunk.id)).filter(Boolean);
  const payload = {
    schemaVersion: 1,
    model: EMBEDDING_MODEL,
    builtAt: new Date().toISOString(),
    sourceSignature: index.sourceSignature,
    vectors,
  };
  await writeFile(embeddingsPath, `${JSON.stringify(payload)}\n`);
  console.log(`Embeddings RAG prontos: ${vectors.length} vetores locais.`);
};

const parseSearchOptions = (args) => {
  const options = { limit: DEFAULT_LIMIT, json: false, semantic: false, query: [] };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--limit') {
      options.limit = Number(args[index + 1]) || DEFAULT_LIMIT;
      index += 1;
    } else if (value === '--json') {
      options.json = true;
    } else if (value === '--semantic') {
      options.semantic = true;
    } else {
      options.query.push(value);
    }
  }
  return options;
};

const search = async (args) => {
  const options = parseSearchOptions(args);
  const query = options.query.join(' ').trim();
  if (!query) throw new Error('Informe os termos da demanda para pesquisar a memória.');
  const index = await loadIndex();
  const queryTokens = tokenize(query);
  const documentFrequency = buildDocumentFrequency(index.chunks);
  const averageLength = index.chunks.reduce((total, chunk) => total + chunk.tokenCount, 0) / Math.max(index.chunks.length, 1);
  const queryNormalized = normalize(query);
  const scoreById = new Map();

  index.chunks.forEach((chunk) => {
    const tokens = tokenize(chunk.text);
    const termFrequency = new Map();
    tokens.forEach((token) => termFrequency.set(token, (termFrequency.get(token) ?? 0) + 1));
    let score = 0;
    queryTokens.forEach((token) => {
      const tf = termFrequency.get(token) ?? 0;
      if (!tf) return;
      const df = documentFrequency.get(token) ?? 0;
      const idf = Math.log(1 + ((index.chunks.length - df + 0.5) / (df + 0.5)));
      const denominator = tf + 1.2 * (1 - 0.75 + (0.75 * tokens.length / Math.max(averageLength, 1)));
      score += idf * ((tf * 2.2) / denominator);
    });
    if (queryNormalized.length > 4 && chunk.normalizedText.includes(queryNormalized)) score += 3;
    if (queryTokens.some((token) => normalize(chunk.section).includes(token))) score += 0.75;
    scoreById.set(chunk.id, score);
  });

  let strategy = 'lexical-bm25';
  if (options.semantic) {
    if (!existsSync(embeddingsPath)) {
      throw new Error('Embeddings ausentes. Execute `node scripts/agent-memory-rag.mjs embed` uma vez após configurar OPENAI_API_KEY.');
    }
    const embeddings = await readJson(embeddingsPath);
    if (embeddings.sourceSignature !== index.sourceSignature) {
      throw new Error('Embeddings desatualizados. Execute `node scripts/agent-memory-rag.mjs embed` ao fechar o lote.');
    }
    const [queryVector] = await createEmbedding([query]);
    const vectorById = new Map(embeddings.vectors.map((vector) => [vector.id, vector.values]));
    index.chunks.forEach((chunk) => {
      const semanticScore = cosineSimilarity(queryVector, vectorById.get(chunk.id) ?? []);
      scoreById.set(chunk.id, (scoreById.get(chunk.id) ?? 0) + semanticScore * 5);
    });
    strategy = 'hybrid-bm25-plus-embeddings';
  }

  const results = index.chunks
    .map((chunk) => ({
      score: Number(((scoreById.get(chunk.id) ?? 0) * sourceWeight(chunk.path)).toFixed(3)),
      source: chunk.path,
      section: chunk.section,
      excerpt: chunk.text,
    }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.source.localeCompare(right.source))
    .slice(0, Math.max(1, options.limit));

  const payload = { query, strategy, results };
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log(`RAG (${strategy}) · ${results.length} trecho(s) para: ${query}`);
  results.forEach((result, position) => {
    console.log(`\n${position + 1}. [${result.score}] ${result.source} — ${result.section}`);
    console.log(`   ${result.excerpt}`);
  });
};

const showStatus = async () => {
  const { sources } = await collectSources();
  if (!existsSync(indexPath)) {
    console.log(`Índice ausente. Fontes autorizadas: ${sources.length}. Execute \`index\`.`);
    return;
  }
  const index = await readJson(indexPath);
  const current = index.sourceSignature === sourceSignature(sources);
  const semantic = existsSync(embeddingsPath)
    ? (await readJson(embeddingsPath)).sourceSignature === index.sourceSignature
    : false;
  console.log(JSON.stringify({
    index: current ? 'ATUAL' : 'DESATUALIZADO',
    sources: sources.length,
    chunks: index.chunks.length,
    semanticEmbeddings: semantic ? 'ATUAL' : 'NAO_CONFIGURADO_OU_DESATUALIZADO',
  }, null, 2));
};

const [command = 'help', ...args] = process.argv.slice(2);
try {
  if (command === 'index') await buildIndex();
  else if (command === 'search') await search(args);
  else if (command === 'embed') await buildEmbeddings();
  else if (command === 'status') await showStatus();
  else printHelp();
} catch (error) {
  console.error(`RAG: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
