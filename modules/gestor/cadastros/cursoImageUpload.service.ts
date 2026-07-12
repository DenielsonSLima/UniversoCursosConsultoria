import { supabase } from '../../../lib/supabase';

const compressCursoImage = (file: File): Promise<{ file: File; ext: string; type: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxWidth = 800;
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ file, ext: file.name.split('.').pop() || 'jpg', type: file.type });
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        const isWebpSupported = canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
        const format = isWebpSupported ? 'image/webp' : 'image/jpeg';
        const ext = isWebpSupported ? 'webp' : 'jpg';

        canvas.toBlob((blob) => {
          if (blob) {
            const webpFile = new File([blob], `curso_${Date.now()}.${ext}`, { type: format });
            resolve({ file: webpFile, ext, type: format });
          } else {
            resolve({ file, ext: file.name.split('.').pop() || 'jpg', type: file.type });
          }
        }, format, 0.8);
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
};

export const uploadCursoImagem = async (file: File): Promise<string> => {
  const { file: compressedFile, ext, type } = await compressCursoImage(file);
  const filePath = `cursos/curso_${Date.now()}.${ext}`;

  const { data, error } = await supabase.storage
    .from('documentos')
    .upload(filePath, compressedFile, {
      cacheControl: '31536000',
      upsert: true,
      contentType: type
    });

  if (error) throw error;

  const { data: urlData } = supabase.storage
    .from('documentos')
    .getPublicUrl(data.path);

  return urlData.publicUrl;
};
