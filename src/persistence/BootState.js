// @ts-check
/// <reference path="./API.d.ts" />

import { attachedStorageOptions } from './attached';
import { bestEncode } from './bestEncode';
import { CommentHeader } from './dom/CommentHeader';
import { DOMDrive } from './dom/DOMDrive';
import { DOMFile, tryParseDOMFile } from './dom/DOMFile';
import { DOMTotals, tryParseDOMTotals } from './dom/DOMTotals';
import { MountedDrive } from './MountedDrive';

export class BootState {

  /** @type {number | null} */
  domTimestamp = null;

  /** @type {number | null} */
  domTotalSize = null;

  /** @type {number | null} */
  domLoadedSize = null;

  /** @type {number | null} */
  loadedFileCount = null;

  /** @type {string | null} */
  storageName = null;

  /** @type {number | undefined} */
  storageTimestamp = void 0;

  /** @type {{ [storage: string]: string; }} */
  storageLoadFailures = {};

  /** @type {string[]} */
  newDOMFiles = [];

  /** @type {string[]} */
  newStorageFiles = [];

  /** @type {((node: any, recognizedKind?: 'file' | 'totals', recognizedEntity?: any) => void) | null | undefined} */
	ondomnode = null;

  /** @type {{ [path: string]: DOMFile; }} */
  _byPath = {};

  /** @type {DOMTotals | null} */
  _totals = null;

  /** @type {((drive: persistence.Drive) => void) | null} */
  _completion = null;

  _anticipationSize = 0;

  /** @type {Node | null} */
  _lastNode = null;

  _currentOptionalDriveIndex = 0;

  _shadowFinished = false;

  /**
   * sometimes it lingers here until DOM timestamp is ready
   * @type {persistence.Drive.Detached | null}
   */
  _detachedDrive = null;

  /** @type {persistence.Drive.Shadow | null} */
  _shadow = null;

  /** @type {{ [path: string]: any; } | null} */
  _toUpdateDOM = null;

  /** @type {string[]} */
  _toForgetShadow = [];

  _domFinished = false;

  _reportedFiles = {};

  _newDOMFileCache = {};

  _newStorageFileCache = {};

  /**
   * 
   * @param {Document} _document
   * @param {string} _uniqueKey
   * @param {persistence.Drive.Optional[]} [_optionalDrives]
   */
  constructor(_document, _uniqueKey, _optionalDrives) {
    this._document = _document;
    this._uniqueKey = _uniqueKey;
    this._optionalDrives = _optionalDrives || attachedStorageOptions;

    this._loadNextOptionalDrive();
  }

  /**
   * @param {string} path
   */
  read(path) {
    if (this._toUpdateDOM && path in this._toUpdateDOM)
      return this._toUpdateDOM[path];
    var f = this._byPath[path];
    if (f) return f.read();
    else return null;
  }

  continueLoading() {
    if (!this._domFinished)
      this._continueParsingDOM(false /* toCompletion */);

    this.newDOMFiles = [];
    for (var k in this._newDOMFileCache) {
      if (k && k.charCodeAt(0)==47)
        this.newDOMFiles.push(k);
    }
    this._newDOMFileCache = {};

    this.newStorageFiles = [];
    for (var k in this._newStorageFileCache) {
      if (k && k.charCodeAt(0)==47)
        this.newStorageFiles.push(k);
    }
    this._newStorageFileCache = {};
  }

  /**
   * @param {(drive: persistence.Drive) => void} completion
   */
  finishParsing(completion) {
    if (this._domFinished) {
      try {
        // when debugging, break on any error will hit here too
        throw new Error('finishParsing should only be called once.');
      }
      catch (error) {
        if (typeof console !== 'undefined' && console && typeof console.error==='function')
          console.error(error);
      }
    }

    this._completion = completion;
    this._continueParsingDOM(true /* toCompletion */);
  }

  /**
   * @param {Node} node
   */
  _processNode(node) {
    const cmheader = new CommentHeader(/** @type {Comment} */(node));

    const file = tryParseDOMFile(cmheader);
    if (file) {
      this._processFileNode(file);
      if (typeof this.ondomnode==='function') {
        this.ondomnode(node, 'file', file);
      }
      return;
    }

    const totals = tryParseDOMTotals(cmheader);
    if (totals) {
      this._processTotalsNode(totals);
      if (typeof this.ondomnode==='function') {
        this.ondomnode(node, 'totals', totals);
      }
      return;
    }

    if (typeof this.ondomnode==='function') {
      this.ondomnode(node);
    }

  }

  /**
   * @param {DOMTotals} totals
   */
  _processTotalsNode(totals) {
    if (this._totals) {
      this._removeNode(totals.node);
    }
    else {
      this._totals = totals;
      this.domTimestamp = totals.timestamp;
      this.domTotalSize = Math.max(totals.totalSize, this.domTotalSize || 0);

      var detached = this._detachedDrive;
      if (detached) {
        this._detachedDrive = null;
        this._compareTimestampsAndProceed(detached);
      }
    }
  }

  /**
   * @param {DOMFile} file
   * @returns 
   */
  _processFileNode(file) {
    if (this._byPath[file.path]) { // a file with this name was encountered before
      // prefer earlier nodes
      this._removeNode(file.node);
      return;
    }

    // no updating nodes until whole DOM loaded
    // (looks like some browsers get confused by updating DOM during loading)

    this._byPath[file.path] = file;
    this._newDOMFileCache[file.path] = true;

    this.loadedFileCount = (this.loadedFileCount || 0) + 1;
    this.domLoadedSize = (this.domLoadedSize || 0) + file.contentLength;
    this.domTotalSize = Math.max(this.domTotalSize || 0, this.domLoadedSize || 0);
  }

  /**
   * @param {Node} node
   */
  _removeNode(node) {
    const parent = node.parentElement || node.parentNode;
    if (parent) parent.removeChild(node);
  }

  /**
   * @param {boolean} toCompletion
   */
  _continueParsingDOM(toCompletion){

    this.domLoadedSize = (this.domLoadedSize || 0) - this._anticipationSize;
    this._anticipationSize = 0;

    while (true) {

      // keep very last node unprocessed until whole document loaded
      // -- that means each iteration we find the next node, but process this._lastNode
      const nextNode = this._getNextNode();

      if (!nextNode && !toCompletion) {

        // no more nodes found, but more expected: no processing at this point
        // -- but try to estimate what part of the last known node is loaded (for better progress precision)
        if (this._lastNode && this._lastNode.nodeType===8) {
          const cmheader = new CommentHeader(/** @type {Comment} */(this._lastNode));
          const speculativeFile = tryParseDOMFile(cmheader);
          if (speculativeFile) {
            this._anticipationSize = speculativeFile.contentLength;
            this.domLoadedSize = (this.domLoadedSize || 0) + this._anticipationSize;
            this.domTotalSize = Math.max(this.domTotalSize || 0, this.domLoadedSize || 0); // total should not become less that loaded
          }
        }
        return;
      }

      if (this._lastNode && this._lastNode.nodeType===8) {
        this._processNode(/** @type {Comment} */(this._lastNode));
      }
      else {
        if (typeof this.ondomnode==='function') {
          this.ondomnode(this._lastNode);
        }
      }

      if (!nextNode) {
        // finish
        this._lastNode = null;
        this._processDOMFinished();
        return;
      }

      this._lastNode = nextNode;
    }
  }

  _processDOMFinished() {

    this._domFinished = true;

    if (this._toUpdateDOM) {

      // these are updates from attached storage that have not been written out
      // (because files with corresponding paths don't exist in DOM)

      for (const path in this._toUpdateDOM) {
        /** @type {{ content: string, encoding: string } | undefined} */
        let entry;
        if (!path || path.charCodeAt(0)!==47) continue; // expect leading slash
        const content = this._toUpdateDOM[path];
        if (content && content.content && content.encoding) {
          entry = content; // content could be string or { content, encoding }
        }

        if (content===null) {
          const f = this._byPath[path];
          if (f) {
            delete this._byPath[path];
            this._removeNode(f.node);
          }
          else {
            if (this._shadow) this._shadow.forget(path);
            else this._toForgetShadow.push(path);
          }
        }
        else if (typeof content!=='undefined') {
          const f = this._byPath[path];
          if (f) {
            if (!entry)
              entry = bestEncode(content); // it could already be { content, encoding }

            const modified = f.write(entry.content, entry.encoding);
            if (!modified) {
              if (this._shadow) this._shadow.forget(path);
              else this._toForgetShadow.push(path);
            }
          }
          else {
            const anchor = this._findAnchor();
            const comment = document.createComment('');
            const f = new DOMFile(comment, path, null, 0, 0);
            entry = bestEncode(content);
            f.write(entry.content, entry.encoding);
            this._byPath[path] = f;
            this._newDOMFileCache[path] = true;
            this._document.body.insertBefore(f.node, anchor);
          }
        }
      }
    }

    if (this._shadowFinished) {
      this._allCompleted();
      return;
    }

    const detached = this._detachedDrive;
    if (detached) {
      this._detachedDrive = null;
      this._compareTimestampsAndProceed(detached);
    }
  }

  _finishUpdateTotals() {
    if (this._totals) {
      if ((this.storageTimestamp || 0) > (this.domTimestamp || 0)) {
        this._totals.timestamp = this.storageTimestamp || 0;
        this._totals.updateNode();
      }
    }
  }

  _getNextNode() {
    if (!this._lastNode) {
      const head = this._document.head || this._document.getElementsByTagName('head')[0];
      if (head) {
        const next = head.firstChild;
        if (next) return next;
      }
      const body = this._document.body;
      if (body)
        return body.firstChild;
      return null;
    }

    let nextNode = this._lastNode.nextSibling;
    if (!nextNode) {
      const body = this._document.body || null;
      const lastNodeParent = this._lastNode.parentNode || this._lastNode.parentElement || null;
      if (lastNodeParent!==body)
        nextNode = body.firstChild;
    }
    return nextNode;
  }

  _loadNextOptionalDrive() {

    const nextDrive = this._optionalDrives[this._currentOptionalDriveIndex];
    if (!nextDrive) {
      this._finishOptionalDetection();
      return;
    }

    nextDrive.detect(this._uniqueKey, (error, detached) => {
      if (detached) {
        this.storageName = nextDrive.name;
        this._shadowDetected(detached);
      }
      else {
        this.storageLoadFailures[nextDrive.name] = error || 'Empty return.';
        this._currentOptionalDriveIndex++;
        this._loadNextOptionalDrive();
      }
    });
  }

  /**
   * @param {persistence.Drive.Detached} detached
   */
  _shadowDetected(detached) {
    this.storageTimestamp = detached.timestamp;
    if (this._totals || this._domFinished)
      this._compareTimestampsAndProceed(detached);
    else
      this._detachedDrive = detached;
  }

  /**
   * @param {persistence.Drive.Detached} detached
   */
  _compareTimestampsAndProceed(detached) {
    let domRecent;
    if (detached.timestamp && detached.timestamp > (this.domTimestamp || 0)) domRecent = false;
    else if (!detached.timestamp && !this.domTimestamp) domRecent = false;
    else domRecent = true;

    if (domRecent) {
      detached.purge(shadow => {
        this._shadow = shadow;
        this._finishOptionalDetection();
      });
    }
    else {
      this._toUpdateDOM = {};
      detached.applyTo({
        timestamp: this.domTimestamp || 0,
        write: (path, content, encoding) => {
          this._applyShadowToDOM(path, content, encoding);
        }
      }, shadow => {
        this._shadow = shadow;
        this._finishOptionalDetection();
      });
    }
  }

  /**
   * @param {string} path
   * @param {any} content
   * @param {string | undefined} encoding
   */
  _applyShadowToDOM(path, content, encoding) {
    if (this._domFinished) {

      var file = this._byPath[path];
      if (file) {
        if (content===null) {
          this._removeNode(file.node);
          delete this._byPath[path];
        }
        else {
          var modified = file.write(content, encoding);
          if (!modified)
            this._toForgetShadow.push(path);
        }
      }
      else {
        if (content===null) {
          this._toForgetShadow.push(path);
        }
        else {
          var anchor = this._findAnchor();
          var comment = document.createComment('');
          var f = new DOMFile(comment, path, null, 0, 0);
          f.write(content, encoding);
          this._document.body.insertBefore(f.node, anchor);
          this._byPath[path] = f;
          this._newDOMFileCache[path] = true;
        }
      }
      this._newStorageFileCache[path] = true;
    }
    else {
      if (!this._toUpdateDOM)
        this._toUpdateDOM = {};

      this._toUpdateDOM[path] = encoding ? { content, encoding } : content;
      this._newStorageFileCache[path] = true;
    }
  }

  _findAnchor() {
    /** @type {Node | null} */
    let anchor = null;
    for (var k in this._byPath) if (k && k.charCodeAt(0)===47) {
      anchor = this._byPath[k].node;
    }
    if (!anchor) {
      var scripts = this._document.getElementsByTagName('script');
      anchor = scripts[scripts.length-1];
    }
    return anchor;
  }

  _finishOptionalDetection() {

    if (this._shadow) {
      for (var i = 0; i < this._toForgetShadow.length; i++) {
        this._shadow.forget(this._toForgetShadow[i]);
      }
    }

    this._shadowFinished = true;

    if (this._domFinished){
      this._allCompleted();
    }
  }

  _createSynteticTotals() {
    const comment = this._document.createComment('');
    const totalsParent =
      this._document.head
      || (this._document.getElementsByTagName('head') && this._document.getElementsByTagName('head')[0])
      || this._document.body;
    totalsParent.appendChild(comment);
    this._totals = new DOMTotals(this.domTimestamp || 0, this.domTotalSize || 0, comment);
    this._totals.updateNode();
  }

  _allCompleted() {
    this._finishUpdateTotals();

    const domFiles = [];
    for (var path in this._byPath) {
      if (!path || path.charCodeAt(0)!==47) continue; // expect leading slash
      domFiles.push(this._byPath[path]);
    }

    if (!this._totals)
      this._createSynteticTotals();

    const domDrive = new DOMDrive(/** @type {DOMTotals} */(this._totals), domFiles, this._document);
    const mountDrive = new MountedDrive(domDrive, /** @type {persistence.Drive.Shadow} */(this._shadow));
    /** @type {NonNullable<typeof this._completion>} */(this._completion)(mountDrive);
  }
}
