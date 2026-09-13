export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

export interface Base64File {
  mediaType: string;
  data: string;
}

/** Reads a File into raw base64 (no `data:...;base64,` prefix), ready for an Anthropic image content block. */
export function fileToBase64(file: File): Promise<Base64File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const commaIndex = result.indexOf(',');
      const data = commaIndex >= 0 ? result.slice(commaIndex + 1) : result;
      resolve({ mediaType: file.type || 'application/octet-stream', data });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
