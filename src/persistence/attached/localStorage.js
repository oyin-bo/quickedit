// @ts-check
/// <reference path="../API.d.ts" />

import { encodings } from '../encodings';

/**
 * @param {string} uniqueKey
 * @param {persistence.Drive.ErrorOrDetachedCallback} callback
 */
export function detect(uniqueKey, callback) {
  try {
    detectCore(uniqueKey, callback);
  }
  catch (error) {
    callback(getErrorMessage(error));
  }

  function getErrorMessage(err) {
    if (err.message) return err.message;
    return err + '';
  }
}

/**
 * @param {string} uniqueKey
 * @param {persistence.Drive.ErrorOrDetachedCallback} callback
 */
export function detectCore(uniqueKey, callback) {
  var localStorageInstance = typeof localStorage === 'undefined' ? undefined : localStorage;
  if (!localStorageInstance) {
    callback('Variable localStorage is not available.');
    return;
  }

  const access = new LocalStorageAccess(localStorageInstance, uniqueKey);
  const dt = new LocalStorageDetached(access);
  callback(null, dt);
}

export class LocalStorageAccess {
  /** @type {{ [key: string]: string; }} */
  _cache = {};

  /**
   * 
   * @param {typeof localStorage} _localStorage
   * @param {string} _prefix
   */
  constructor(_localStorage, _prefix) {
    this._localStorage = _localStorage;
    this._prefix = _prefix; 
  }

  /**
   * @param {string} key
   */
  get (key) {
    const k = this._expandKey(key);
    const r = this._localStorage.getItem(k);
    return r;
  }

  /**
   * @param {string} key
   * @param {string} value
   */
  set(key, value) {
    const k = this._expandKey(key);
    try {
      return this._localStorage.setItem(k, value);
    }
    catch (error) {
      try {
        this._localStorage.removeItem(k);
        return this._localStorage.setItem(k, value);
      }
      catch (furtherError) {
      }
    }
  }

  /**
   * @param {string} key
   */
  remove(key) {
    const k = this._expandKey(key);
    return this._localStorage.removeItem(k);
  }

  keys() {
    const result = [];
    var len = this._localStorage.length;
    for (var i = 0; i < len; i++) {
      const str = this._localStorage.key(i);
      if (str && str.length > this._prefix.length && str.slice(0, this._prefix.length) === this._prefix)
        result.push(str.slice(this._prefix.length));
    }
    return result;
  }

  /**
   * @param {string} key
   */
  _expandKey(key) {
    /** @type {string} */
    let k;

    if (!key) {
      k = this._prefix;
    }
    else {
      k = this._cache[key];
      if (!k)
        this._cache[key] = k = this._prefix + key;
    }

    return k;
  }
}

/**
 * @implements {persistence.Drive.Detached}
 */
class LocalStorageDetached {

  timestamp = 0;

  /**
   * @param {LocalStorageAccess} _access
   */
  constructor(_access) {
    this._access = _access;
    var timestampStr = this._access.get('*timestamp');
    if (timestampStr && timestampStr.charAt(0)>='0' && timestampStr.charAt(0)<='9') {
      try {
        this.timestamp = parseInt(timestampStr);
      }
      catch (parseError) {
      }
    }
  }

  /**
   * @param {persistence.Drive.Detached.DOMUpdater} mainDrive
   * @param {persistence.Drive.Detached.CallbackWithShadow} callback
   */
  applyTo(mainDrive, callback) {
    const keys = this._access.keys();
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (k.charCodeAt(0)===47 /* slash */) {
        const value = this._access.get(k);
        if (value && value.charCodeAt(0)===91 /* open square bracket [ */) {
          const cl = value.indexOf(']');
          if (cl>0 && cl < 10) {
            const encoding = value.slice(1,cl);
            const encFn = encodings[encoding];
            if (typeof encFn==='function') {
              mainDrive.write(k, value.slice(cl+1), encoding);
              break;
            }
          }
        }
        mainDrive.write(k, value, 'LF');
      }
    }

    const shadow = new LocalStorageShadow(this._access, mainDrive.timestamp);
    callback(shadow);
  }

  /**
   * @param {persistence.Drive.Detached.CallbackWithShadow} callback
   */
  purge(callback) {
    const keys = this._access.keys();
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (k.charAt(0)==='/') {
        const value = this._access.remove(k);
      }
    }

    const shadow = new LocalStorageShadow(this._access, this.timestamp);
    callback(shadow);
  }

}

/**
 * @implements {persistence.Drive.Shadow}
 */
class LocalStorageShadow {

  /**
   * @param {LocalStorageAccess} _access
   * @param {number} [timestamp]
   */
  constructor(_access, timestamp) {
    this._access = _access;
    this.timestamp = timestamp;
  }

  /**
   * @param {string} file
   * @param {string} content
   * @param {string} encoding
   */
  write(file, content, encoding) {
    this._access.set(file, '[' + encoding + ']' + content);
    if (this.timestamp) this._access.set('*timestamp', String(this.timestamp));
  }

  /**
   * @param {string} file
   */
  forget(file) {
    this._access.remove(file);
  }

}
