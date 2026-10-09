import type { jsPDF } from 'jspdf';

export const EAD_INTER_FAMILY = 'Universo EAD Inter';
const WEIGHTS = [400, 600, 700, 900] as const;
let fontFaces: Promise<void> | null = null;

const bytes = (value: string) => Uint8Array.from(atob(value), character => character.charCodeAt(0));

/** Identical original TTF bytes feed the DOM measurement and the embedded PDF. */
export async function loadEadCertificateFontFaces(family = EAD_INTER_FAMILY): Promise<void> {
  const load = async () => {
    const { EAD_INTER_TTF } = await import('./pdf-assets/inter-ttf');
    await Promise.all(WEIGHTS.map(async weight => {
      const face = new window.FontFace(family, bytes(EAD_INTER_TTF[weight]).buffer, { weight: String(weight), style: 'normal' });
      await face.load();
      document.fonts.add(face);
    }));
  };
  if (family !== EAD_INTER_FAMILY) return load();
  if (!fontFaces) fontFaces = load().catch(error => { fontFaces = null; throw error; });
  await fontFaces;
}

export async function prepareEadCertificateFonts(pdf: jsPDF, root: HTMLElement) {
  await loadEadCertificateFontFaces();
  const { EAD_INTER_TTF } = await import('./pdf-assets/inter-ttf');
  const aliases: Record<string, string> = {};
  WEIGHTS.forEach(weight => {
    const family = `EadInter${weight}`;
    const file = `${family}.ttf`;
    pdf.addFileToVFS(file, EAD_INTER_TTF[weight]);
    pdf.addFont(file, family, 'normal');
    aliases[`${EAD_INTER_FAMILY}:${weight}`] = family;
  });
  // Only the offscreen EAD document receives this private font family.
  for (const node of [root, ...root.querySelectorAll<HTMLElement>('*')]) {
    const family = window.getComputedStyle(node).fontFamily;
    if (/^["']?Inter["']?(?:,|$)/i.test(family)) {
      node.style.fontFamily = family.replace(/^["']?Inter["']?/i, `'${EAD_INTER_FAMILY}'`);
    }
  }
  await document.fonts.ready;
  return aliases;
}
