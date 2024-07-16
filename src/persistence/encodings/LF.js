// @ts-check

const CRLF_OR_CR = /\r\n|\r/g;

/**
 * @param {string} text
 */
export function LF(text) {
  return text.
    replace(CRLF_OR_CR, '\n');
}
