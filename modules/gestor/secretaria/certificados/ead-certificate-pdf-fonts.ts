import type { jsPDF } from 'jspdf';
import { INTER_WEIGHTS, invalidateInterFontData, loadInterFontData } from './pdf-assets/inter-fonts';

export const EAD_INTER_FAMILY = 'Universo EAD Inter';
let fontFaces: Promise<void> | null = null;

/** Identical original TTF bytes feed the DOM measurement and the embedded PDF. */
export async function loadEadCertificateFontFaces(family = EAD_INTER_FAMILY): Promise<void> {
  const load = async () => {
    try {
      const fonts = await loadInterFontData();
      await Promise.all(INTER_WEIGHTS.map(async weight => {
        const face = new window.FontFace(family, fonts[weight].buffer, { weight: String(weight), style: 'normal' });
        await face.load();
        document.fonts.add(face);
      }));
    } catch (error) {
      invalidateInterFontData();
      throw error;
    }
  };
  if (family !== EAD_INTER_FAMILY) return load();
  if (!fontFaces) fontFaces = load().catch(error => { fontFaces = null; throw error; });
  await fontFaces;
}

export async function prepareEadCertificateFonts(pdf: jsPDF, root: HTMLElement) {
  await loadEadCertificateFontFaces();
  const fonts = await loadInterFontData();
  const aliases: Record<string, string> = {};
  INTER_WEIGHTS.forEach(weight => {
    const family = `EadInter${weight}`;
    const file = `${family}.ttf`;
    pdf.addFileToVFS(file, fonts[weight].base64);
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
