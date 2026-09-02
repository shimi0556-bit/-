import { z } from "zod";

export const indexSchema = z
  .number()
  .int()
  .min(1)
  .describe("1-based index, matching Resolume's own numbering (as shown in the UI).");

export const HttpMethodSchema = z.enum(["GET", "PUT", "POST", "DELETE", "PATCH"]);
