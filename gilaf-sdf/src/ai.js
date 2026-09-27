// Prompts for asking Claude (through the artifact `sample` capability) to write or improve recipes.

/* global RECIPE_REFERENCE, BUILTIN_RECIPES */

const OUTPUT_RULES = `Output format: reply with ONE \`\`\`js code block containing the complete recipe (a function body that ends with \`return <shape>\`). Put short English comments inside the code. Do not write anything after the code block.`;

function base() {
  return `You are a master 3D sculptor and technical artist. You build models as signed distance fields in the Gilaf recipe language, and you care about proportions, silhouette, clean forms and appealing color.

<reference>
${RECIPE_REFERENCE}
</reference>

<example_of_expected_quality>
${(BUILTIN_RECIPES.find((r) => r.id === 'robot') || BUILTIN_RECIPES[0] || { code: '' }).code}
</example_of_expected_quality>
`;
}

export function promptCreate(description) {
  return `${base()}
Create a new model: ${description}

Plan before coding: decide the reference size, list the primary masses, secondary forms and details, and the color palette. Then write the recipe. Use variables for key proportions and add 1–3 \`param()\` sliders for the most interesting proportions. Aim for a model that looks professionally designed, not a stack of primitives.

${OUTPUT_RULES}`;
}

export function promptImprove(code, instruction, withImage) {
  return `${base()}
Here is the current recipe:
\`\`\`js
${code}
\`\`\`
${withImage ? 'The attached image shows the current render from four angles: three-quarter front, front, side and back.\n' : ''}
${instruction ? `Requested change: ${instruction}` : 'Critique the model (proportions, silhouette, forms, detail, color) and return a clearly better version.'}

Keep what already works. Return the full updated recipe.

${OUTPUT_RULES}`;
}

export function promptFix(code, error) {
  return `${base()}
This recipe fails with an error:
\`\`\`
${error}
\`\`\`
Recipe:
\`\`\`js
${code}
\`\`\`
Fix the error with the smallest change that keeps the design intent. Return the full fixed recipe.

${OUTPUT_RULES}`;
}

export function extractCode(text) {
  const blocks = [...text.matchAll(/```(?:js|javascript)?[ \t]*\n([\s\S]*?)```/g)].map((m) => m[1]);
  if (blocks.length) return blocks.sort((a, b) => b.length - a.length)[0].trim();
  // an unfinished block while streaming
  const open = text.match(/```(?:js|javascript)?[ \t]*\n([\s\S]*)$/);
  if (open) return open[1].trim();
  return text.trim();
}

export const SAMPLE_ERRORS = {
  not_granted: 'לא ניתנה הרשאה להשתמש ב־Claude בדף הזה.',
  sampling_disabled: 'Claude לא זמין בחשבון הזה.',
  rate_limited: 'יותר מדי בקשות כרגע. נסו שוב בעוד דקה.',
  session_expired: 'צריך להתחבר מחדש ל־claude.ai.',
  refused: 'Claude סירב לבקשה הזו. נסו לנסח אחרת.',
  empty_completion: 'לא התקבלה תשובה. נסו בקשה פשוטה יותר.',
  prompt_too_large: 'המתכון ארוך מדי לשליחה.',
  image_rejected: 'התמונה נדחתה. נסו בלי תמונה.',
  images_unavailable: 'אי אפשר לשלוח תמונות מהתצוגה הזו. נסו בלי תמונה.',
  upstream_error: 'תקלה זמנית. נסו שוב.',
};
