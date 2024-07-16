// @ts-check

const CRLF_OR_LF = /\r\n|\n/g;

/**
 * @param {string} text
 */
export function CR(text) {
  return text.
    replace(CRLF_OR_LF, '\r');
}
