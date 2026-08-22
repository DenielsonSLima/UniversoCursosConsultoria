const UPPERCASE = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWERCASE = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%*-_";
const ALL_PASSWORD_CHARACTERS = UPPERCASE + LOWERCASE + DIGITS + SYMBOLS;

const secureRandomIndex = (length: number) => {
  const limit = Math.floor(4_294_967_296 / length) * length;
  const value = new Uint32Array(1);
  do {
    crypto.getRandomValues(value);
  } while (value[0] >= limit);
  return value[0] % length;
};

const pick = (characters: string) =>
  characters[secureRandomIndex(characters.length)];

const shuffle = (characters: string[]) => {
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = secureRandomIndex(index + 1);
    [characters[index], characters[swapIndex]] = [
      characters[swapIndex],
      characters[index],
    ];
  }
  return characters;
};

/** CSPRNG com ao menos um caractere de cada classe, sem persistir o segredo. */
export const generateTemporaryPassword = () => {
  const characters = [
    pick(UPPERCASE),
    pick(LOWERCASE),
    pick(DIGITS),
    pick(SYMBOLS),
  ];
  while (characters.length < 16) characters.push(pick(ALL_PASSWORD_CHARACTERS));
  return shuffle(characters).join("");
};
