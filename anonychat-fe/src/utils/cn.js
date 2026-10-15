/**
 * Combines CSS class names into a single string, omitting falsy values.
 * Keeps class names static and deterministic for Tailwind CSS compiler.
 *
 * @param  {...any} inputs - Class strings, expressions, or conditionals
 * @returns {string} - Combined class string
 */
export function cn(...inputs) {
  return inputs.filter(Boolean).join(' ');
}

export default cn;
