/** Terminal output helpers. Colour is dropped for non-TTY output and when NO_COLOR is set. */

const ESC = String.fromCharCode(27);
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

const wrap = (code) => (text) => (useColor ? `${ESC}[${code}m${text}${ESC}[0m` : text);

export const bold = wrap('1');
export const dim = wrap('2');
export const red = wrap('31');
export const green = wrap('32');
export const yellow = wrap('33');
export const cyan = wrap('36');

export const SYMBOL = { ok: 'OK', warn: '!!', fail: 'XX', pending: '..' };

export function line(level, label, detail) {
  const paint = { ok: green, warn: yellow, fail: red }[level] ?? dim;
  const padded = label.padEnd(18);
  return `  ${paint(SYMBOL[level] ?? SYMBOL.pending)} ${padded} ${dim(detail)}`;
}

export function heading(text) {
  return `\n${bold(text)}`;
}

/** Fixed-width progress bar, e.g. [####------]. */
export function bar(current, total, width = 10) {
  if (!total) return '';
  const filled = Math.max(0, Math.min(width, Math.round((current / total) * width)));
  return `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}]`;
}
