// @ts-check

const CRLF_OR_CR_OR_LF = /\r\n|\r|\n/g;

/**
 * @param {string} text
 */
export function CRLF(text) {
    return text.
    replace(CRLF_OR_CR_OR_LF, '\r\n');
}