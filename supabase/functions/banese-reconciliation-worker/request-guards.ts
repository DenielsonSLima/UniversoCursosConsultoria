export const safeEqual = (left: string, right: string) => {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
};

export const readRequestBody = async (req: Request) => {
  const text = await req.text();
  if (!text) return;
  if (text.length > 1_024) throw new Error("Corpo da requisição inválido.");
  JSON.parse(text);
};
