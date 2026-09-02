export const DEFAULT_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

// gpt-image-1 is OpenAI's current general-purpose image model. dall-e-2/dall-e-3
// remain selectable via the `model` argument for accounts/endpoints that still
// support them, but are legacy and may be rejected by the API depending on
// current OpenAI policy for a given account.
export const DEFAULT_MODEL = "gpt-image-1";

// Cap how much text a single tool response can contain.
export const CHARACTER_LIMIT = 25000;
