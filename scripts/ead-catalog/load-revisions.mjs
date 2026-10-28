import { readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadRevisions(root = resolve('content/ead')) {
  const releases = [];
  const visit = async directory => {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.name.endsWith('.mjs')) {
        const revision = (await import(pathToFileURL(path).href)).default;
        if (revision?.courseId && revision?.revisionId) {
          releases.push({ path: relative(process.cwd(), path), revision });
        }
      }
    }
  };
  await visit(resolve(root, 'catalogo-a'));
  await visit(resolve(root, 'catalogo-b'));
  await visit(resolve(root, 'catalogo-c'));
  await visit(resolve(root, 'catalogo-raiz'));
  return releases;
}
