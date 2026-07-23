import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = process.cwd();
const markdownPath = path.join(
  root,
  'docs/relatorio-sessao-whatsapp-financeiro-banese-cnab-2026-07-22.md',
);
const rtfPath = path.join(root, '.codex-session-report.rtf');
const outputPath = path.join(
  root,
  'docs/Relatorio-Sessao-WhatsApp-Financeiro-Banese-CNAB-2026-07-22.docx',
);
const logoPath = path.join(root, 'public/LogoUniverso.png');

function rtfText(value) {
  let result = '';
  for (const character of String(value)) {
    if (character === '\\' || character === '{' || character === '}') {
      result += `\\${character}`;
      continue;
    }
    const codePoint = character.codePointAt(0);
    if (codePoint >= 32 && codePoint <= 126) {
      result += character;
      continue;
    }
    if (codePoint <= 0xffff) {
      const signed = codePoint > 32767 ? codePoint - 65536 : codePoint;
      result += `\\u${signed}?`;
      continue;
    }
    const adjusted = codePoint - 0x10000;
    const high = 0xd800 + (adjusted >> 10);
    const low = 0xdc00 + (adjusted & 0x3ff);
    result += `\\u${high - 65536}?\\u${low - 65536}?`;
  }
  return result;
}

function inline(value) {
  const source = String(value);
  const tokenPattern = /(\[[^\]]+\]\(https?:\/\/[^)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let output = '';
  for (const match of source.matchAll(tokenPattern)) {
    output += rtfText(source.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      output += `{\\b\\cf4 ${rtfText(token.slice(2, -2))}}`;
    } else if (token.startsWith('`')) {
      output += `{\\f1\\fs19\\cf8 ${rtfText(token.slice(1, -1))}}`;
    } else {
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
      output += `{\\field{\\*\\fldinst HYPERLINK "${rtfText(link[2])}"}{\\fldrslt{\\ul\\cf7 ${rtfText(link[1])}}}}`;
    }
    last = match.index + token.length;
  }
  output += rtfText(source.slice(last));
  return output;
}

const paragraph = (text) => `\\pard\\sa120\\sl300\\slmult1\\f0\\fs22\\cf4 ${inline(text)}\\par\n`;
const heading = (level, text) => {
  if (level === 2) return `\\pard\\keepn\\sb360\\sa200\\f0\\b\\fs32\\cf1 ${inline(text)}\\par\n`;
  if (level === 3) return `\\pard\\keepn\\sb280\\sa140\\f0\\b\\fs26\\cf3 ${inline(text)}\\par\n`;
  return `\\pard\\keepn\\sb220\\sa100\\f0\\b\\fs24\\cf3 ${inline(text)}\\par\n`;
};

const cellBorders = '\\clbrdrt\\brdrs\\brdrw8\\brdrcf9'
  + '\\clbrdrl\\brdrs\\brdrw8\\brdrcf9'
  + '\\clbrdrb\\brdrs\\brdrw8\\brdrcf9'
  + '\\clbrdrr\\brdrs\\brdrw8\\brdrcf9';

function tableRow(cells, widths, options = {}) {
  const { header = false, alternate = false } = options;
  let position = 120;
  let definitions = '';
  for (const width of widths) {
    position += width;
    const fill = header ? '\\clcbpat6' : alternate ? '\\clcbpat10' : '';
    definitions += `\\clvertalt${fill}${cellBorders}\\cellx${position}`;
  }
  const content = cells.map((cell) => (
    `\\pard\\intbl\\ql\\sa80\\sl260\\slmult1\\f0\\fs20${header ? '\\b\\cf1' : '\\cf4'} ${inline(cell)}\\cell`
  )).join('');
  return `\\trowd\\trkeep\\trgaph120\\trleft120${definitions}${content}\\row\n`;
}

function table(rows) {
  if (!rows.length) return '';
  const columns = Math.max(...rows.map((row) => row.length));
  const base = Math.floor(9360 / columns);
  const widths = Array.from({ length: columns }, (_, index) => (
    index === columns - 1 ? 9360 - base * (columns - 1) : base
  ));
  let result = '\\pard\\sa80\\par\n';
  rows.forEach((row, index) => {
    const normalized = Array.from({ length: columns }, (_, column) => row[column] ?? '');
    result += tableRow(normalized, widths, { header: index === 0, alternate: index > 0 && index % 2 === 0 });
  });
  return `${result}\\pard\\sa140\\par\n`;
}

const isTableSeparator = (line) => /^\s*\|?\s*:?-{3,}/.test(line);
const splitTableRow = (line) => line
  .trim()
  .replace(/^\|/, '')
  .replace(/\|$/, '')
  .split('|')
  .map((cell) => cell.trim());

function markdownToRtf(markdown) {
  const lines = markdown.replaceAll('\r\n', '\n').split('\n');
  const out = [];
  let index = 0;
  let pendingParagraph = [];

  const flush = () => {
    if (!pendingParagraph.length) return;
    out.push(paragraph(pendingParagraph.join(' ')));
    pendingParagraph = [];
  };

  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      flush();
      index += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      flush();
      index += 1;
      const codeLines = [];
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index]);
        index += 1;
      }
      index += 1;
      const code = codeLines.map(rtfText).join('\\line ');
      out.push(`\\pard\\li180\\ri180\\sb80\\sa180\\sl260\\slmult1\\shading800\\cbpat10\\brdrl\\brdrs\\brdrw28\\brdrcf3\\f1\\fs19\\cf4 ${code}\\par\n`);
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      flush();
      const level = headingMatch[1].length;
      if (level > 1) out.push(heading(level, headingMatch[2]));
      index += 1;
      continue;
    }

    if (trimmed.startsWith('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      flush();
      const rows = [splitTableRow(lines[index])];
      index += 2;
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      out.push(table(rows));
      continue;
    }

    const bulletMatch = trimmed.match(/^-\s+(.+)$/);
    if (bulletMatch) {
      flush();
      while (index < lines.length) {
        const item = lines[index].trim().match(/^-\s+(.+)$/);
        if (!item) break;
        out.push(`\\pard\\ls1\\ilvl0\\fi-270\\li540\\sa80\\sl300\\slmult1\\f0\\fs22\\cf4 ${inline(item[1])}\\par\n`);
        index += 1;
      }
      out.push('\\pard\\sa40\\par\n');
      continue;
    }

    const numberedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (numberedMatch) {
      flush();
      while (index < lines.length) {
        const item = lines[index].trim().match(/^\d+\.\s+(.+)$/);
        if (!item) break;
        out.push(`\\pard\\ls2\\ilvl0\\fi-270\\li540\\sa80\\sl300\\slmult1\\f0\\fs22\\cf4 ${inline(item[1])}\\par\n`);
        index += 1;
      }
      out.push('\\pard\\sa40\\par\n');
      continue;
    }

    pendingParagraph.push(trimmed.replace(/\s{2}$/, ''));
    index += 1;
  }

  flush();
  return out.join('');
}

const markdown = await fs.readFile(markdownPath, 'utf8');
const logoHex = (await fs.readFile(logoPath)).toString('hex');
const body = markdownToRtf(markdown);

const fontTable = '{\\fonttbl{\\f0\\fnil Calibri;}{\\f1\\fmodern Menlo;}{\\f2\\fnil Arial;}}';
const colorTable = '{\\colortbl;'
  + '\\red7\\green18\\blue107;'
  + '\\red225\\green29\\blue46;'
  + '\\red18\\green79\\blue115;'
  + '\\red23\\green34\\blue59;'
  + '\\red91\\green102\\blue124;'
  + '\\red232\\green238\\blue245;'
  + '\\red11\\green90\\blue143;'
  + '\\red138\\green24\\blue48;'
  + '\\red174\\green185\\blue200;'
  + '\\red247\\green249\\blue252;}';
const listTables = '{\\*\\listtable'
  + '{\\list\\listtemplateid1\\listhybrid'
  + '{\\listlevel\\levelnfc23\\levelnfcn23\\leveljc0\\leveljcn0\\levelfollow0\\levelstartat1'
  + '{\\leveltext\\leveltemplateid1\\\'01\\u8226 ?;}{\\levelnumbers;}\\fi-270\\li540\\lin540}\\listid1}'
  + '{\\list\\listtemplateid2\\listhybrid'
  + '{\\listlevel\\levelnfc0\\levelnfcn0\\leveljc0\\leveljcn0\\levelfollow0\\levelstartat1'
  + '{\\leveltext\\leveltemplateid2\\\'02\\\'00.;}{\\levelnumbers\\\'01;}\\fi-270\\li540\\lin540}\\listid2}'
  + '}{\\*\\listoverridetable{\\listoverride\\listid1\\listoverridecount0\\ls1}'
  + '{\\listoverride\\listid2\\listoverridecount0\\ls2}}';

const coverMeta = table([
  ['Projeto', 'Universo Cursos e Consultoria'],
  ['Período', '21–22 de julho de 2026'],
  ['Escopo bancário', 'Banese: boleto/Pix · Mercado Pago: cartão'],
  ['Contingência', 'CNAB240 somente após falha da API e homologação EDI7'],
  ['Classificação', 'Uso interno — sem segredos ou dados pessoais'],
]);

const rtf = `{\\rtf1\\ansi\\ansicpg1252\\uc1\\deff0\\deflang1046
${fontTable}${colorTable}${listTables}
{\\info{\\title Relatório da sessão - Universo Cursos e Consultoria}{\\author Universo Cursos e Consultoria}{\\subject Integrações WhatsApp e financeiras}{\\keywords Banese; CNAB240; Mercado Pago; WhatsApp; Financeiro}}
\\paperw12240\\paperh15840\\margl1440\\margr1440\\margt1440\\margb1440\\headery708\\footery708\\widowctrl
{\\header\\pard\\tqr\\tx9360\\f0\\fs17\\cf5 UNIVERSO CURSOS E CONSULTORIA\\tab RELATÓRIO TÉCNICO\\par\\brdrb\\brdrs\\brdrw8\\brdrcf9\\par}
{\\footer\\pard\\tqr\\tx9360\\f0\\fs17\\cf5 Uso interno · 21–22/07/2026\\tab Página {\\field{\\*\\fldinst PAGE}{\\fldrslt 1}}\\par}
\\pard\\sa520{\\pict\\pngblip\\picw704\\pich192\\picwgoal5760\\pichgoal1571 ${logoHex}}\\par
\\pard\\sa180\\f0\\b\\fs20\\cf2\\caps RELATÓRIO TÉCNICO E GUIA DE HOMOLOGAÇÃO\\par
\\pard\\sa220\\f0\\b\\fs54\\cf1 WhatsApp, Financeiro, Banese, CNAB240 e Mercado Pago\\par
\\pard\\sa420\\f0\\fs28\\cf5 Implementação, segurança financeira, validação integrada e roteiro de testes manuais.\\par
\\pard\\brdrb\\brdrs\\brdrw42\\brdrcf2\\sa300\\par
${coverMeta}
\\pard\\sb300\\sa160\\li180\\ri180\\shading500\\cbpat6\\brdrl\\brdrs\\brdrw36\\brdrcf1\\f0\\fs22\\cf4 {\\b Status da entrega:} implementação e deploy técnico concluídos; produção financeira permanece bloqueada nos pontos que dependem de homologação externa.\\par
\\page
${body}
}`;

await fs.writeFile(rtfPath, rtf, 'utf8');
await fs.rm(outputPath, { force: true });
const conversion = await run('/usr/bin/textutil', [
  '-convert', 'docx',
  '-format', 'rtf',
  '-output', outputPath,
  rtfPath,
], { cwd: root, maxBuffer: 5_000_000 });
const stat = await fs.stat(outputPath);
console.log(JSON.stringify({ outputPath, bytes: stat.size, stderr: conversion.stderr }));
