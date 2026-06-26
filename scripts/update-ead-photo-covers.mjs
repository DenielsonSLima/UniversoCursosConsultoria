import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

if (process.env.ALLOW_RANDOM_EAD_COVER_FETCH !== 'true') {
  throw new Error(
    [
      'Este script antigo baixa fotos aleatorias por tags e pode gerar capas fora do contexto do curso.',
      'Use scripts/upload-ead-generated-covers.mjs para subir as capas EAD geradas e revisadas localmente.',
      'Para executar o fluxo antigo de proposito, defina ALLOW_RANDOM_EAD_COVER_FETCH=true.',
    ].join('\n'),
  );
}

const rootDir = process.cwd();
const coversDir = path.join(rootDir, 'public/course-covers/ead');
const manifestPath = path.join(rootDir, 'Documentos/Cursos EAD Novos 2026/capas-fotograficas-manifest.json');
const storageBucket = 'documentos';
const storagePrefix = 'course-covers/ead';
const runStamp = `photo-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}`;

const coursePhotoTags = {
  'acolhimento-e-seguranca-no-retorno-as-aulas': 'school,children,classroom',
  'agente-comunitario-de-saude': 'healthworker,family,home',
  'agente-de-portaria': 'security,guard,building',
  'almoxarifado': 'warehouse,inventory,worker',
  'analises-clinicas': 'laboratory,technician,microscope',
  'aperfeicoamento-em-educacao-interdimensional': 'teacher,students,classroom',
  'atendente-de-farmacia': 'pharmacy,pharmacist,medicine',
  'atualizacao-em-radiologia': 'radiology,xray,hospital',
  'auxiliar-administrativo': 'office,assistant,paperwork',
  'auxiliar-corretor-de-imoveis': 'realestate,agent,keys',
  'auxiliar-de-cozinha': 'kitchen,cooking,chef',
  'auxiliar-de-creche': 'daycare,children,teacher',
  'auxiliar-de-veterinario': 'veterinary,dog,clinic',
  'auxiliar-pedagogico': 'teacher,assistant,classroom',
  'barbeiro-profissional': 'barber,haircut,salon',
  'condutor-de-transporte-escolar': 'schoolbus,driver,children',
  'conhecimentos-bancarios': 'bank,finance,office',
  'criacao-de-loja-virtual': 'ecommerce,packing,laptop',
  'cuidador-de-idoso': 'elderly,caregiver,nurse',
  'designer-de-cilios-e-sobrancelha': 'eyelash,beauty,salon',
  'digitacao-interativa': 'typing,keyboard,computer',
  'educacao-e-gestao-escolar': 'school,principal,office',
  'educacao-fisica-escolar': 'children,sports,school',
  'educacao-nas-mudancas-da-sociedade': 'classroom,technology,students',
  'educacao-social-na-adolescencia': 'teenagers,workshop,education',
  'eletricista': 'electrician,wiring,worker',
  'estoque-e-faturamento': 'inventory,warehouse,computer',
  'excel-basico-e-avancado': 'spreadsheet,laptop,office',
  'excel-kids': 'children,computer,classroom',
  'fiscal-de-loja': 'retail,security,store',
  'frentista': 'gasstation,attendant,fuel',
  'gestao-em-rh': 'humanresources,meeting,office',
  'instagram-para-vendas': 'smartphone,socialmedia,business',
  'introducao-a-nutricao': 'nutritionist,food,consultation',
  'logistica-4-0': 'logistics,warehouse,tablet',
  'manicure-e-pedicure': 'manicure,nails,salon',
  'marketing-digital': 'marketing,laptop,office',
  'matematica-basica': 'math,classroom,blackboard',
  'matematica-eja': 'adult,student,classroom',
  'matematica-infantil': 'children,math,classroom',
  'matematica-para-enem': 'math,student,classroom',
  'mediador-escolar-monitor-escolar': 'teacher,student,classroom',
  'metodologias-ativas-para-o-professor': 'activelearning,classroom,teacher',
  'monitor-escolar-de-classe-auxiliar-do-regente': 'teacher,assistant,students',
  'nr-10': 'electrician,safety,panel',
  'oficineiro': 'workshop,crafts,instructor',
  'operador-de-caixa': 'cashier,supermarket,checkout',
  'operador-de-empilhadeira': 'forklift,warehouse,operator',
  'oratoria': 'speaker,presentation,audience',
  'pa-carregadeira': 'loader,construction,machine',
  'porteiro-e-vigia': 'security,guard,gate',
  'redes-sociais': 'socialmedia,smartphone,creator',
  'retroescavadeira': 'backhoe,construction,machine',
  'secretariado-escolar': 'school,secretary,reception',
  'servicos-sociais-basico': 'socialworker,community,family',
  'tecnicas-de-redacao': 'writing,student,notebook',
  'telemarketing': 'callcenter,headset,office',
  'word-kids': 'kids,typing,computer',
};

const areaFallbackTags = {
  'Administração e Gestão': 'office,meeting,business',
  Educação: 'teacher,students,classroom',
  Saúde: 'healthcare,clinic,professional',
  'Tecnologia e Comunicação': 'computer,technology,office',
  'Comércio e Vendas': 'store,sales,customer',
  'Segurança e Operações': 'worker,safety,industry',
  'Beleza e Bem-estar': 'beauty,salon,professional',
  'Serviços e Finanças': 'service,office,professional',
};

function readEnv() {
  const envFiles = ['.env.local', '.env'];
  const env = {};

  for (const file of envFiles) {
    const filePath = path.join(rootDir, file);
    if (!existsSync(filePath)) continue;

    for (const line of readFileSync(filePath, 'utf8').split('\n')) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match) continue;
      env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }

  return {
    url: env.REACT_APP_SUPABASE_URL || env.VITE_SUPABASE_URL,
    key: env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.REACT_APP_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY,
  };
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' e ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function hashNumber(value) {
  return Number.parseInt(createHash('sha1').update(value).digest('hex').slice(0, 8), 16);
}

function imageHash(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function tagsForCourse(course) {
  const slug = slugify(course.nome);
  return coursePhotoTags[slug] || areaFallbackTags[course.area] || 'professional,training,work';
}

function uniqueValues(values) {
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
}

function tagCandidatesForCourse(course) {
  const primary = tagsForCourse(course);
  const areaFallback = areaFallbackTags[course.area];
  const slug = slugify(course.nome);
  const courseWords = slug
    .split('-')
    .filter((word) => word.length > 3)
    .join(',');

  return uniqueValues([
    primary,
    ...primary.split(','),
    courseWords,
    areaFallback,
    ...(areaFallback ? areaFallback.split(',') : []),
    'professional,workplace,training',
  ]);
}

function photoUrlFor(tags, slug, attempt) {
  const lock = (hashNumber(`${slug}:${attempt}`) % 95000) + 1000;
  return `https://loremflickr.com/1400/788/${encodeURIComponent(tags)}?lock=${lock}`;
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function restRequest(baseUrl, apiKey, pathName, options = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    ...options,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${pathName}: ${response.status} ${await response.text()}`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function fetchCourses(baseUrl, apiKey) {
  return restRequest(
    baseUrl,
    apiKey,
    '/rest/v1/cursos?modalidade=eq.EAD&select=id,nome,area,imagem_url&order=nome.asc',
  );
}

async function downloadPhoto(tags, slug, attemptStart = 0) {
  let lastError;

  for (let attempt = attemptStart; attempt < attemptStart + 4; attempt += 1) {
    const url = photoUrlFor(tags, slug, attempt);
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'UniversoCursos/1.0 cover updater',
        },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.startsWith('image/')) throw new Error(`content-type ${contentType}`);

      return {
        sourceUrl: response.url || url,
        buffer: Buffer.from(await response.arrayBuffer()),
      };
    } catch (error) {
      lastError = error;
      await wait(400);
    }
  }

  throw new Error(`Nao foi possivel baixar foto para ${slug}: ${lastError?.message || lastError}`);
}

async function saveOptimizedCover(photoBuffer, outputPath) {
  const buffer = await sharp(photoBuffer)
    .rotate()
    .resize(1200, 675, { fit: 'cover', position: 'attention' })
    .modulate({ saturation: 1.03, brightness: 1.02 })
    .webp({ quality: 82, effort: 5 })
    .toBuffer();

  writeFileSync(outputPath, buffer);
  return buffer;
}

async function uploadCover(baseUrl, apiKey, slug, coverBuffer) {
  const uploadPath = `/${storageBucket}/${storagePrefix}/${slug}.webp`;
  const response = await fetch(`${baseUrl}/storage/v1/object${uploadPath}`, {
    method: 'POST',
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'image/webp',
      'x-upsert': 'true',
    },
    body: coverBuffer,
  });

  if (!response.ok) {
    throw new Error(`Upload ${slug}: ${response.status} ${await response.text()}`);
  }

  return `${baseUrl}/storage/v1/object/public${uploadPath}?v=${runStamp}`;
}

async function updateCourseImage(baseUrl, apiKey, courseId, imagemUrl) {
  await restRequest(baseUrl, apiKey, `/rest/v1/cursos?id=eq.${courseId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ imagem_url: imagemUrl }),
  });
}

async function main() {
  const { url: baseUrl, key: apiKey } = readEnv();
  if (!baseUrl || !apiKey) {
    throw new Error('Configure REACT_APP_SUPABASE_URL/VITE_SUPABASE_URL e a chave do Supabase no .env.local.');
  }

  mkdirSync(coversDir, { recursive: true });
  mkdirSync(path.dirname(manifestPath), { recursive: true });

  const courses = await fetchCourses(baseUrl, apiKey);
  const manifest = [];
  const hashes = new Map();

  for (const course of courses) {
    const slug = slugify(course.nome);
    const outputPath = path.join(coversDir, `${slug}.webp`);
    const candidates = tagCandidatesForCourse(course);

    let selected = null;
    console.log(`> ${course.nome}`);

    for (const tags of candidates) {
      for (let attemptStart = 0; attemptStart < 28; attemptStart += 4) {
        const photo = await downloadPhoto(tags, slug, attemptStart);
        if (photo.sourceUrl.includes('defaultImage')) {
          console.log(`  - ignorando imagem padrao :: ${tags}`);
          continue;
        }

        const coverBuffer = await saveOptimizedCover(photo.buffer, outputPath);
        const digest = imageHash(coverBuffer);
        const duplicateOf = hashes.get(digest) || null;

        if (duplicateOf) {
          console.log(`  - ignorando repetida de ${duplicateOf} :: ${tags}`);
          continue;
        }

        selected = {
          tags,
          photo,
          coverBuffer,
          digest,
        };
        break;
      }

      if (selected) break;
    }

    if (!selected) {
      throw new Error(`Nao foi possivel encontrar foto unica para ${course.nome}.`);
    }

    const { tags, photo, coverBuffer, digest } = selected;
    hashes.set(digest, course.nome);

    const imagemUrl = await uploadCover(baseUrl, apiKey, slug, coverBuffer);
    await updateCourseImage(baseUrl, apiKey, course.id, imagemUrl);

    manifest.push({
      nome: course.nome,
      area: course.area,
      slug,
      tags,
      sourceUrl: photo.sourceUrl,
      localPath: `public/course-covers/ead/${slug}.webp`,
      imagemUrl,
      bytes: coverBuffer.byteLength,
      sha256: digest,
      duplicateOf: null,
    });

    await wait(250);
  }

  writeFileSync(manifestPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), total: manifest.length, covers: manifest }, null, 2)}\n`);
  const duplicates = manifest.filter((item) => item.duplicateOf);
  console.log(JSON.stringify({ total: manifest.length, uniqueImages: hashes.size, duplicates: duplicates.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
