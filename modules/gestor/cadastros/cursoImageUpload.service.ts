import { supabase } from '../../../lib/supabase';

const compressCursoImage = (file: File): Promise<File> => {
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
          resolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          const output = blob || file;
          resolve(new File([output], `curso_${Date.now()}.webp`, { type: 'image/webp' }));
        }, 'image/webp', 0.8);
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
};

export const uploadCursoImagem = async (file: File): Promise<string> => {
  const timestamp = Date.now();
  const compressedFile = await compressCursoImage(file);
  const filePath = `cursos/curso_${timestamp}.webp`;

  const { data, error } = await supabase.storage
    .from('documentos')
    .upload(filePath, compressedFile, {
      cacheControl: '31536000',
      upsert: true,
      contentType: 'image/webp'
    });

  if (error) throw error;

  const { data: urlData } = supabase.storage
    .from('documentos')
    .getPublicUrl(data.path);

  return urlData.publicUrl;
};
