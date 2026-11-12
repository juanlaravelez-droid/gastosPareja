export const MAX_GOAL_COVER_INPUT_SIZE = 20 * 1024 * 1024;
export const MAX_GOAL_COVER_SIZE = 1.5 * 1024 * 1024;
export const GOAL_COVER_MAX_WIDTH = 800;
export const GOAL_COVER_JPEG_QUALITY = 0.75;

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function validateGoalCoverFile(file) {
  if (!file || !SUPPORTED_IMAGE_TYPES.has(file.type)) {
    return "Selecciona una imagen JPG, PNG o WebP.";
  }
  if (file.size <= 0 || file.size > MAX_GOAL_COVER_INPUT_SIZE) {
    return "La imagen no puede superar 20 MB.";
  }
  return null;
}

export async function prepareGoalCover(file) {
  const validationError = validateGoalCoverFile(file);
  if (validationError) throw new Error(validationError);
  if (typeof createImageBitmap !== "function") {
    throw new Error("Este navegador no permite preparar la imagen. Prueba con otro navegador actualizado.");
  }

  const bitmap = await createImageBitmap(file);
  try {
    if (!bitmap.width || !bitmap.height) {
      throw new Error("No se pudo leer la imagen seleccionada.");
    }

    let scale = Math.min(1, GOAL_COVER_MAX_WIDTH / bitmap.width);
    while (scale >= 0.25) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No se pudo preparar la imagen seleccionada.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", GOAL_COVER_JPEG_QUALITY);
      });
      canvas.width = 0;
      canvas.height = 0;
      if (!blob) throw new Error("No se pudo comprimir la imagen seleccionada.");
      if (blob.size <= MAX_GOAL_COVER_SIZE) return blob;
      scale *= 0.75;
    }

    throw new Error("La imagen sigue siendo demasiado pesada después de comprimirla.");
  } finally {
    bitmap.close();
  }
}

export function readGoalCoverAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") {
        reject(new Error("No se pudo guardar la portada en esta demo."));
        return;
      }
      resolve(reader.result);
    }, { once: true });
    reader.addEventListener("error", () => {
      reject(reader.error || new Error("No se pudo guardar la portada en esta demo."));
    }, { once: true });
    reader.readAsDataURL(blob);
  });
}
