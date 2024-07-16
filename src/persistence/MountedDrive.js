// @ts-check
/// <reference path="./API.d.ts" />

import { bestEncode } from './bestEncode';

/**
 * @implements {persistence.Drive}
 */
export class MountedDrive {

  updateTime = true;
  timestamp = 0;

  /** @type {string[] | null} */
  _cachedFiles = null;

  /**
   * @param {persistence.Drive.Detached.DOMDrive} _dom
   * @param {persistence.Drive.Shadow} _shadow
   */
  constructor(_dom, _shadow) {
    this._dom = _dom;
    this._shadow = _shadow;
    this.timestamp = this._dom.timestamp;
  }

  files() {
    if (!this._cachedFiles)
      this._cachedFiles = this._dom.files();

    return this._cachedFiles.slice(0);
  }

  /**
   * @param {string} file
   */
  read(file) {
    return this._dom.read(file);
  }

  /**
   * @param {string} file
   */
  storedSize(file) {
    if (typeof this._dom.storedSize === 'function')
      return this._dom.storedSize(file);
    else
      return null;
  }

  /**
   * @param {string} file
   * @param {string} content
   */
  write(file, content) {
    if (this.updateTime)
      this.timestamp = +new Date();

    this._cachedFiles = null;

    this._dom.timestamp = this.timestamp;

    const encoded = typeof content === 'undefined' || content === null ? null : bestEncode(content);

    if (encoded)
      this._dom.write(file, encoded.content, encoded.encoding);
    else
      this._dom.write(file, null);

    if (this._shadow) {
      this._shadow.timestamp = this.timestamp;
      if (encoded)
        this._shadow.write(file, encoded.content, encoded.encoding);
      else
        this._shadow.write(file, null);
    }
  }
}
