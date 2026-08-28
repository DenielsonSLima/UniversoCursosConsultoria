const tlv = (id: string, value: string) =>
  `${id}${String(value.length).padStart(2, "0")}${value}`;

const crc16Ccitt = (value: string) => {
  let result = 0xffff;
  for (const byte of new TextEncoder().encode(value)) {
    result ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      result = (result & 0x8000) !== 0
        ? ((result << 1) ^ 0x1021) & 0xffff
        : (result << 1) & 0xffff;
    }
  }
  return result.toString(16).toUpperCase().padStart(4, "0");
};

export const buildBanesePixPayloadFixture = (
  txid: string,
  amount = 20_000,
  gui = "BR.GOV.BCB.PIX",
  accountReference = "12345678901",
) => {
  const merchantAccount = `${tlv("00", gui)}${tlv("01", accountReference)}`;
  const additionalData = tlv("05", txid);
  const withoutChecksum = [
    tlv("00", "01"),
    tlv("26", merchantAccount),
    tlv("52", "0000"),
    tlv("53", "986"),
    tlv("54", amount.toFixed(2)),
    tlv("58", "BR"),
    tlv("59", "UNIVERSO"),
    tlv("60", "JAPOATA"),
    tlv("62", additionalData),
    "6304",
  ].join("");
  return `${withoutChecksum}${crc16Ccitt(withoutChecksum)}`;
};

export const buildBanesePixImageFixture = (seed: number) => {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  return `iVBORw0KGgo${"A".repeat(51)}${alphabet[seed % alphabet.length]}`;
};
