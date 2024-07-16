// @ts-check

/**
 * @typedef {function(string):string} Encoding
 */

/**
 * @param {string} text
 */
export function base64(text) {
  if (text && text.charCodeAt(0)===42) {
    const bin = _atob(text.slice(1));
    const buf = typeof Uint8Array==='function' ? new Uint8Array(bin.length) : [];
    for (var i = 0; i < bin.length; i++) {
      buf[i] = bin.charCodeAt(i);
    }
    return buf;
  }
  else {
    return _atob(text);
  }
}

export const _btoa = typeof btoa === 'function' ? btoa : btoaPolyfill;
export const _atob = typeof atob === 'function' ? atob : atobPolyfill;


const e = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
function btoaPolyfill(r) {
  for (var o, n, a = String(r), i = 0, c = e, d = ""; a.charAt(0 | i) || (c = "=", i % 1); d += c.charAt(63 & o >> 8 - i % 1 * 8)) {
    if (n = a.charCodeAt(i += .75), n > 255)
      throw new InvalidCharacterError("'btoa' failed: The string to be encoded contains characters outside of the Latin1 range.");
    o = /** @type {*} */(o) << 8 | n
  }
  return d;
}

const suffixRegexp = /=+$/g;
function atobPolyfill(r) {
  var o = String(r).replace(suffixRegexp, "");
  if (o.length % 4 == 1)
    throw new InvalidCharacterError("'atob' failed: The string to be decoded is not correctly encoded.");
  for (var n, a, i = 0, c = 0, d = ""; a = o.charAt(c++); ~a && (n = i % 4 ? 64 * /** @type {*} */(n) + a : a, i++ % 4) ? d += String.fromCharCode(255 & n >> (-2 * i & 6)) : 0)
    a = e.indexOf(a);
  return d;
}

class InvalidCharacterError extends Error { constructor(message) { super(message) } }