// @deno-types="npm:@types/qrcode@1.5.5"
import QRCode from "npm:qrcode@1.5.4";

import { normalizeBanesePixQrImage } from "./pix-validation.ts";

/**
 * Renderiza a imagem escaneável usando exclusivamente o payload EMV oficial
 * retornado pelo Banese. O conteúdo Pix não é criado nem alterado aqui.
 */
export const renderOfficialBanesePixQr = async (payload: string) => {
  const dataUrl = await QRCode.toDataURL(payload, {
    type: "image/png",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 320,
  });

  return normalizeBanesePixQrImage(dataUrl);
};
