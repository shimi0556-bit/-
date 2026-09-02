import axios, { AxiosError, type AxiosInstance } from "axios";
import type FormData from "form-data";
import { DEFAULT_BASE_URL } from "../constants.js";
import type { ImagesApiResponse } from "../types.js";

function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY environment variable is not set. Get a key from https://platform.openai.com/api-keys " +
        "and configure it in this MCP server's environment before calling any tool."
    );
  }
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}`, ...extra };
  if (process.env.OPENAI_ORGANIZATION) headers["OpenAI-Organization"] = process.env.OPENAI_ORGANIZATION;
  if (process.env.OPENAI_PROJECT) headers["OpenAI-Project"] = process.env.OPENAI_PROJECT;
  return headers;
}

class OpenAiImagesClient {
  private http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: DEFAULT_BASE_URL,
      timeout: 120000, // image generation/editing can take a while, especially at high quality
    });
  }

  async generate(body: Record<string, unknown>): Promise<ImagesApiResponse> {
    const response = await this.http.post<ImagesApiResponse>("/images/generations", body, {
      headers: buildHeaders({ "Content-Type": "application/json" }),
    });
    return response.data;
  }

  async postMultipart(path: string, form: FormData): Promise<ImagesApiResponse> {
    const response = await this.http.post<ImagesApiResponse>(path, form, {
      headers: buildHeaders(form.getHeaders()),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    return response.data;
  }

  /** Download a remote (signed) image URL as returned by the API, no auth needed. */
  async downloadUrl(url: string): Promise<Buffer> {
    const response = await axios.get<ArrayBuffer>(url, { responseType: "arraybuffer" });
    return Buffer.from(response.data);
  }
}

export const openaiImagesClient = new OpenAiImagesClient();

export function handleApiError(error: unknown): string {
  if (error instanceof Error && error.message.startsWith("OPENAI_API_KEY")) {
    return `Error: ${error.message}`;
  }
  if (axios.isAxiosError(error)) {
    const err = error as AxiosError<{ error?: { message?: string; code?: string; type?: string } }>;
    if (!err.response) {
      return `Error: Could not reach the OpenAI API (${err.code ?? err.message}). Check network connectivity.`;
    }
    const status = err.response.status;
    const apiMessage = err.response.data?.error?.message;
    const code = err.response.data?.error?.code;
    switch (status) {
      case 401:
        return "Error: 401 Unauthorized - OPENAI_API_KEY is missing or invalid.";
      case 400:
        return `Error: 400 Bad Request${code ? ` (${code})` : ""} - ${
          apiMessage ?? "the request was rejected. Check that the parameters are valid for the chosen model."
        }`;
      case 403:
        return `Error: 403 Forbidden - ${
          apiMessage ?? "your account/API key doesn't have access to this model or feature."
        }`;
      case 404:
        return `Error: 404 Not Found - ${apiMessage ?? "check the model name."}`;
      case 429:
        return `Error: 429 Rate limit or quota exceeded - ${apiMessage ?? "slow down or check your billing/usage."}`;
      default:
        return `Error: OpenAI API returned status ${status}${apiMessage ? ` - ${apiMessage}` : ""}`;
    }
  }
  return `Error: Unexpected error occurred: ${error instanceof Error ? error.message : String(error)}`;
}
