// @ts-check

import { bestEncode } from './bestEncode';
import { DOMFile } from './dom/DOMFile';
import { DOMTotals } from './dom/DOMTotals';

/**
 * @param {number} timestamp
 * @param {number} totalSize
 */
export function formatTotalsInner(timestamp, totalSize) {

  const tot = new DOMTotals(timestamp, totalSize, /** @type {*} */(null));
  return /** @type {string} */(tot.updateNode());

}

/**
 * @param {string} path
 */
export function formatFileInner(path, content) {

  var fi = new DOMFile(
    /** @type {*}*/(null), // noded
    path,
    /** @type {*}*/(null), // encoding
    0, 0);
  const entry = bestEncode(content);
  return /** @type {string} */(fi.write(entry.content, entry.encoding));
}
