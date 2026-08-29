const HEIC_MEDIA_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

function hasHeicName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".heic") || lower.endsWith(".heif");
}

function jpegFilename(name: string): string {
  return hasHeicName(name) ? name.replace(/\.(heic|heif)$/i, ".jpg") : `${name}.jpg`;
}

async function shouldConvert(file: File): Promise<boolean> {
  const type = file.type.toLowerCase();
  if (HEIC_MEDIA_TYPES.has(type) || hasHeicName(file.name)) {
    return true;
  }
  if (type === "" || type === "application/octet-stream") {
    const { isHeic } = await import("heic-to");
    return isHeic(file);
  }
  return false;
}

export async function prepareImageFiles(files: File[]): Promise<File[]> {
  return Promise.all(
    files.map(async (file) => {
      if (!(await shouldConvert(file))) {
        return file;
      }

      const { heicTo } = await import("heic-to");
      const blob = await heicTo({
        blob: file,
        quality: 0.85,
        type: "image/jpeg",
      });

      return new File([blob], jpegFilename(file.name), {
        lastModified: Date.now(),
        type: "image/jpeg",
      });
    }),
  );
}
