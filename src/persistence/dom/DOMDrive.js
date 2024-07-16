// @ts-check
/// <reference path="../API.d.ts" />

import { normalizePath } from '../normalizePath';
import { DOMFile } from './DOMFile';
import { DOMTotals } from './DOMTotals';

/**
 * @implements {persistence.Drive}
 * @property {number} timestamp
 */
export class DOMDrive {

  /** @type {{ [path: string]: DOMFile; }} */
  _byPath = {};
  /** @type {Node | null} */
  _anchorNode = null;
  _totalSize = 0;

  /**
   * 
   * @param {DOMTotals} _totals
   * @param {DOMFile[]} files 
   * @param {DocumentSubset} _document 
   */
  constructor(_totals, files, _document) {
    this._totals = _totals;
    this._document = _document;

    for (let i = 0; i < files.length; i++) {
      this._byPath[files[i].path] = files[i];
      this._totalSize += files[i].contentLength;
      if (!this._anchorNode) this._anchorNode = files[i].node;
    }

    if (!this._totals) {
      const comment = this._document.createComment('');
      const parent = this._document.head || this._document.getElementsByTagName('head')[0] || this._document.body;
      parent.insertBefore(
        comment,
        // insert before any elements, but after comments and other insignificant nodes
        /** @type {HTMLElement} */(parent).children ? /** @type {HTMLElement} */(parent).children[0] : null);
      this._totals = new DOMTotals(0, this._totalSize, comment);
    }

    this.timestamp = this._totals.timestamp;
  }

  files() {

    let result;

    if (typeof Object.keys === 'string') {
      result = Object.keys(this._byPath);
    }
    else {
      result = [];
      for (const k in this._byPath) if (this._byPath.hasOwnProperty(k)) {
        result.push(k);
      }
    }

    result.sort();

    return result;
  }

  /**
   * @param {string} file
   */
  read(file) {
    const f = this._byPath[normalizePath(file)];
    if (f)
      return f.read();
  }

  /**
   * @param {string} file
   */
  storedSize(file) {
    const f = this._byPath[normalizePath(file)];
    return f?.contentLength;
  }

  /**
   * @param {string} file
   * @param {string} content
   * @param {string} [encoding]
   */
  write(file, content, encoding) {

    let totalDelta = 0;

    const fileNormalized = normalizePath(file);
    let f = this._byPath[fileNormalized];

    if (content === null) {
      // removal
      if (f) {
        totalDelta -= f.contentLength;
        var parentElem = f.node.parentElement || f.node.parentNode;
        if (parentElem)
          parentElem.removeChild(f.node);
        delete this._byPath[fileNormalized];
      }
    }
    else {
      if (f) { // update
        const lengthBefore = f.contentLength;
        if (!f.write(content, encoding)) return; // no changes - no update for timestamp/totals
        totalDelta += f.contentLength - lengthBefore;
      }
      else { // addition
        var comment = document.createComment('');
        f = new DOMFile(comment, fileNormalized, null, 0, 0);
        f.write(content, encoding);

        this._anchorNeeded();

        if (this._document.body) {
          this._document.body.insertBefore(f.node, this._anchorNode);
        } else if (this._document.head) {
          this._document.head?.appendChild(f.node);
        } else {
          throw new Error('Cannot write to HTML DOM without body or head.');
        }

        this._anchorNode = f.node; // next time insert before this node
        this._byPath[fileNormalized] = f;
        totalDelta += f.contentLength;
      }
    }

    this._totals.timestamp = this.timestamp;
    this._totals.totalSize += totalDelta;
    this._totals.updateNode();
  }

  loadProgress() {
    return { total: this._totals ? this._totals.totalSize : this._totalSize, loaded: this._totalSize };
  }

  /**
   * @param {DOMFile | DOMTotals} entry
   */
  continueLoad(entry) {
    if (!entry) {
      // force failure
      this.continueLoad = function() { throw new Error('Loading complete, cannot continue.') };
      this._totals.totalSize = this._totalSize;
      this._totals.updateNode();
      return;
    }

    if (/** @type {DOMFile} */(entry).path) {
      const file = /** @type {DOMFile} */(entry);
      // in case of duplicates, prefer earlier, remove latter
      if (this._byPath[file.path]) {
        if (!file.node) return;
        var p = file.node.parentElement || file.node.parentNode;
        if (p) p.removeChild(file.node);
        return;
      }

      this._byPath[file.path] = file;
      if (!this._anchorNode) this._anchorNode = file.node;
      this._totalSize += file.contentLength;
    }
    else {
      const totals = /** @type {DOMTotals} */(entry);
      // consider the values, but throw away the later totals DOM node
      this._totals.timestamp = Math.max(this._totals.timestamp, totals.timestamp|0);
      this._totals.totalSize = Math.max(this._totals.totalSize, totals.totalSize|0);
      if (!totals.node) return;
      var p = totals.node.parentElement || totals.node.parentNode;
      if (p) p.removeChild(totals.node);
    }
  }

  _anchorNeeded() {
    // try to insert at the start, so new files will be loaded first
    let anchor = this._anchorNode;
    if (anchor && anchor.parentElement === this._document.body) return;

    // this happens when filesystem is empty, or nodes got removed
    // - we try not to bubble above scripts, so boot UI is rendered fast even on slow connections
    const scripts = this._document.body?.getElementsByTagName('script');
    if (scripts) {
      anchor = scripts[scripts.length - 1];
      if (anchor) {
        var next = anchor.nextSibling;
        if (!next && anchor.parentNode)
          next = anchor.parentNode.nextSibling;
        anchor = next;
      }
    }

    if (anchor) this._anchorNode = anchor;
  }

}


/**
 * @typedef {{
 *  body?: HTMLBodyElementSubset;
 *  head?: Node;
 *  createComment(data: string): Comment;
 *  getElementsByTagName(tag: string): { [index: number]: Node; length: number };
 * }} DocumentSubset
 */

/**
 * @typedef {{
 *  appendChild(node: Node): void;
 *  insertBefore(newChild: Node, refNode: Node | null): void;
 *  getElementsByTagName(tag: string): { [index: number]: Node; length: number; };
 *  firstChild: Node | null;
 *  children: { [index: number]: Node; length: number; };
 * }} HTMLBodyElementSubset
 */
