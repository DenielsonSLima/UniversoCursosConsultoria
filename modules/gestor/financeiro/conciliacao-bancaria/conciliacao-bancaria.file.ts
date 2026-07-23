export const readCnabFileAsBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result !== 'string' || !reader.result) {
      reject(new Error('Não foi possível ler o arquivo CNAB.'));
      return;
    }
    const [, base64] = reader.result.split(',');
    resolve(base64 || reader.result);
  };
  reader.onerror = () => reject(reader.error || new Error('Erro ao ler arquivo CNAB.'));
  reader.readAsDataURL(file);
});
