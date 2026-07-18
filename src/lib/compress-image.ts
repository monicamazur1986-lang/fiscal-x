'use client';

function isHeic(file: File): boolean {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return type.includes('heic') || type.includes('heif') || name.endsWith('.heic') || name.endsWith('.heif');
}

// Navegadores em geral não decodificam HEIC/HEIF (formato padrão da câmera do
// iPhone) via <img>/canvas — sem essa conversão prévia pra JPEG, o anexo
// falhava (antes travava para sempre; ver o timeout abaixo).
async function convertHeicToJpeg(file: File): Promise<Blob> {
  const heic2any = (await import('heic2any')).default;
  const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
  return Array.isArray(converted) ? converted[0] : converted;
}

function decodeAndResize(source: Blob, maxDimension: number, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(source);

    // Em formatos que o navegador não sabe decodificar, nem onload nem
    // onerror disparam — sem esse timeout, a Promise fica pendurada pra
    // sempre e trava o botão de anexar num loop de carregamento infinito,
    // sem toast de sucesso nem de erro.
    const timeoutId = setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Não foi possível processar essa imagem (formato não suportado pelo navegador).'));
    }, 15000);

    img.onload = () => {
      clearTimeout(timeoutId);
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas não suportado.'));
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Falha ao comprimir imagem.'));
      }, 'image/jpeg', quality);
    };

    img.onerror = () => {
      clearTimeout(timeoutId);
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Falha ao carregar imagem.'));
    };

    img.src = objectUrl;
  });
}

/**
 * Redimensiona e comprime uma imagem no navegador (canvas) antes de enviar —
 * reduz o tamanho tanto para upload no Storage (mais rápido em conexão de
 * campo) quanto para o fallback em base64 direto no Firestore (que tem teto
 * de 1MB por documento). Converte HEIC/HEIF para JPEG antes, se necessário.
 */
export async function compressImage(file: File, maxDimension = 1280, quality = 0.7): Promise<Blob> {
  let source: File | Blob = file;
  if (isHeic(file)) {
    try {
      source = await convertHeicToJpeg(file);
    } catch {
      throw new Error('Não foi possível converter essa imagem HEIC.');
    }
  }
  return decodeAndResize(source, maxDimension, quality);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Falha ao converter imagem.'));
    reader.readAsDataURL(blob);
  });
}
