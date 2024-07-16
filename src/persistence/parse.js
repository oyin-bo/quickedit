// @ts-check
/// <reference path="./API.d.ts" />

import { CommentHeader } from './dom/CommentHeader';
import { tryParseDOMFile } from './dom/DOMFile';
import { tryParseDOMTotals } from './dom/DOMTotals';

/**
 * @param {string} content
 */
export function parseTotalsInner(content) {
  const tot = tryParseDOMTotals(/** @type {*} */({header: content }));
  if (tot) return {timestamp: tot.timestamp, totalSize: tot.totalSize };
}

/**
 * @param {string} content
 */
export function parseFileInner(content) {

  const cm = new CommentHeader(/** @type {*} */({nodeValue: content}));
  const fi = tryParseDOMFile(cm);
  return fi;
}

const scriptOrCommentStart_Regexp = /(\<script[\s\>])|(\<!\-\-)/gi;
const scriptEnd_Regexp = /\<\/script\s*\>/gi;
const commentEnd_Regexp = /\-\-\>/g;


/**
 * @param {string} html 
 */
export function parseHTML(html) {

  /** @type {{ path: string; content: string; start: number; end: number; }[]} */
  const files = [];
  /** @type {{ timestamp: number; totalSize: number} | undefined} */
  let totals;
  /** @type {number | undefined} */
  let totalsCommentStart;
  /** @type {number | undefined} */
  let totalsCommentEnd;


  let pos = 0;
  while (true) {
    scriptOrCommentStart_Regexp.lastIndex = pos;
    let next = scriptOrCommentStart_Regexp.exec(html);
    if (!next) break;
    pos = next.index + next[0].length;

    if (next[1]) { // script
      scriptEnd_Regexp.lastIndex = pos;
      next = scriptEnd_Regexp.exec(html);
      if (!next) break; // script tag never ends
      pos = next.index + next[0].length;
      continue; // skipped script
    }

    const commentStartOffset = next.index;
    const start = pos;

    commentEnd_Regexp.lastIndex = pos;
    next = commentEnd_Regexp.exec(html);
    if (!next) break; // no end of comment

    const end = next.index;
    const commentEndOffset = next.index+next[0].length;

    const inner = html.slice(start,end);

    pos = next.index + next[0].length;

    if (!totals) {
      totals = parseTotalsInner(inner);
      if (totals) {
        totalsCommentStart = commentStartOffset;
        totalsCommentEnd = commentEndOffset;
        continue;
      }
    }

    var fi = parseFileInner(inner);
    if (fi) files.push({path: fi.path, content: fi.read(), start: commentStartOffset, end: commentEndOffset});
  }

  if (totals) return {
    files,
    totals: {
      size: totals.totalSize,
      timestamp: totals.timestamp,
      start: totalsCommentStart,
      end: totalsCommentEnd
    }
  };

  return { files };
}
