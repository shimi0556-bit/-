export interface GeneratedImage {
  url?: string;
  b64_json?: string;
  revised_prompt?: string;
}

export interface ImagesApiResponse {
  created?: number;
  data?: GeneratedImage[];
  background?: string;
  output_format?: string;
  quality?: string;
  size?: string;
  usage?: Record<string, unknown>;
  [key: string]: unknown;
}

export type OutputFormat = "png" | "jpeg" | "webp";

export function mimeTypeForFormat(format?: string): string {
  switch (format) {
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "png":
    default:
      return "image/png";
  }
}

export function extensionForFormat(format?: string): string {
  switch (format) {
    case "jpeg":
      return "jpg";
    case "webp":
      return "webp";
    case "png":
    default:
      return "png";
  }
}
