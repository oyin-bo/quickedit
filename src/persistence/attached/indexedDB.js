// @ts-check
/// <reference path="../API.d.ts" />

//declare var onerror;

const DEFAULT_DBNAME = 'persistence-quickedit';

/**
 * @param {string} uniqueKey
 * @param {persistence.Drive.ErrorOrDetachedCallback} callback
 */
export function detect(uniqueKey, callback) {
  try {

    // Firefox fires global window.onerror
    // when indexedDB.open is called in private mode
    // (even though it still reports failure in request.onerror and DOES NOT throw anything)
    const needsFirefoxPrivateModeOnerrorWorkaround =
        typeof document !== 'undefined' && document.documentElement && document.documentElement.style
        && 'MozAppearance' in document.documentElement.style;

    if (needsFirefoxPrivateModeOnerrorWorkaround) {
      try {

        detectCore(
          uniqueKey,
          (error, detached) => {
            callback(error, detached);

            // the global window.onerror will fire AFTER request.onerror,
            // so here we temporarily install a dummy handler for it
            const tmp_onerror = onerror;
            onerror = function () { };
            setTimeout(function () {
              // restore on the next 'beat'
              onerror = tmp_onerror;
            }, 1);

          });

      }
      catch (err) {
        callback(err.message);
      }
    }
    else {

        detectCore(uniqueKey, callback);
    }

  }
  catch (error) {
    callback(error.message);
  }
}

/**
 * @param {string} uniqueKey
 * @param {persistence.Drive.ErrorOrDetachedCallback} callback
 */
function detectCore(uniqueKey, callback) {

  const indexedDBInstance = typeof indexedDB === 'undefined' ? undefined : indexedDB;
  if (!indexedDBInstance) {
    callback('Variable indexedDB is not available.');
    return;
  }

  const dbName = uniqueKey || DEFAULT_DBNAME;

  const openRequest = indexedDBInstance.open(dbName, 1);

  openRequest.onerror = (errorEvent) => callback('Opening database error: '+getErrorMessage(errorEvent));

  openRequest.onupgradeneeded = createDBAndTables;

  openRequest.onsuccess = (event) => {
    const db = openRequest.result;

    try {
      var transaction = db.transaction(['files', 'metadata']);
      // files mentioned here, but not really used to detect
      // broken multi-store transaction implementation in Safari

      transaction.onerror = (errorEvent) => callback('Transaction error: '+getErrorMessage(errorEvent));

      var metadataStore = transaction.objectStore('metadata');
      var filesStore = transaction.objectStore('files');
      var editedUTCRequest = metadataStore.get('editedUTC');
    }
    catch (getStoreError) {
      callback('Cannot open database: '+getStoreError.message);
      return;
    }

    if (!editedUTCRequest) {
      callback('Request for editedUTC was not created.');
      return;
    }

    editedUTCRequest.onerror = (errorEvent) => {
      var detached = new IndexedDBDetached(db, transaction);
      callback(null, detached);
    };

    editedUTCRequest.onsuccess = (event) => {
      /** @type {MetadataData} */
      const result = editedUTCRequest.result;
      const detached = new IndexedDBDetached(db, transaction, result && typeof result.value === 'number' ? result.value : void 0);
      callback(null, detached);
    };
  }


  function createDBAndTables() {
    const db = openRequest.result;
    var filesStore = db.createObjectStore('files', { keyPath: 'path' });
    var metadataStore = db.createObjectStore('metadata', { keyPath: 'property' })
  }
}

function getErrorMessage(event) {
  if (event.message) return event.message;
  else if (event.target) return event.target.errorCode;
  return event+'';
}

/**
 * @implements {persistence.Drive.Detached}
 */
class IndexedDBDetached {

  /**
   * @param {IDBDatabase} _db
   * @param {IDBTransaction} [_transaction]
   * @param {number} [timestamp]
   */
  constructor(_db, _transaction, timestamp) {
    this._db = _db;
    this._transaction = _transaction;
    this.timestamp = timestamp;

    // ensure the same transaction is used for applyTo/purge if possible
    // -- but not if it's completed
    if (this._transaction) {
      this._transaction.oncomplete = () => {
        this._transaction = void 0;
      };
    }
  }

  /**
   * @param {persistence.Drive.Detached.DOMUpdater} mainDrive
   * @param {persistence.Drive.Detached.CallbackWithShadow} callback
   */
  applyTo(mainDrive, callback) {
    let transaction = this._transaction || this._db.transaction(['files', 'metadata']); // try to reuse the original opening _transaction
    let metadataStore = transaction.objectStore('metadata');
    let filesStore = transaction.objectStore('files');

    const onerror = (errorEvent) => {
      if (typeof console!=='undefined' && console && typeof console.error==='function')
        console.error('Could not count files store: ', errorEvent);
      callback(new IndexedDBShadow(this._db, this.timestamp));
    };

    try {
      var countRequest = filesStore.count();
    }
    catch (error) {
      try {
        transaction = this._db.transaction(['files', 'metadata']); // try to reuse the original opening _transaction
        metadataStore = transaction.objectStore('metadata');
        filesStore = transaction.objectStore('files');
        countRequest = filesStore.count();
      }
      catch (error) {
        onerror(error);
        return;
      }
    }

    countRequest.onerror = onerror;

    countRequest.onsuccess = (event) => {

      try {

        let storeCount = countRequest.result;

        const cursorRequest = filesStore.openCursor();
        cursorRequest.onerror = (errorEvent) => {
          if (typeof console!=='undefined' && console && typeof console.error==='function')
            console.error('Could not open cursor: ', errorEvent);
          callback(new IndexedDBShadow(this._db, this.timestamp));
        };

        let processedCount = 0;

        cursorRequest.onsuccess = (event) => {

          try {
            const cursor = cursorRequest.result;

            if (!cursor) {
              callback(new IndexedDBShadow(this._db, this.timestamp));
              return;
            }

            if (callback.progress)
              callback.progress(processedCount, storeCount);
            processedCount++;

            /** @type {FileData} */
            const result = cursor.value;
            if (result && result.path) {
              mainDrive.timestamp = this.timestamp;
              mainDrive.write(result.path, result.content, result.encoding);
            }

            cursor['continue']();

          }
          catch (cursorContinueSuccessHandlingError) {
            let message = 'Failing to process cursor continue';
            try {
              message += ' ('+processedCount+' of '+storeCount+'): ';
            }
            catch (ignoreDiagError) {
              message += ': ';
            }

            if (typeof console!=='undefined' && console && typeof console.error==='function')
              console.error(message, cursorContinueSuccessHandlingError);
            callback(new IndexedDBShadow(this._db, this.timestamp));
          }

        }; // cursorRequest.onsuccess

      }
      catch (cursorCountSuccessHandlingError) {

        var message = 'Failing to process cursor count';
        try {
          message += ' ('+countRequest.result+'): ';
        }
        catch (ignoreDiagError) {
          message += ': ';
        }

        if (typeof console!=='undefined' && console && typeof console.error==='function')
          console.error(message, cursorCountSuccessHandlingError);
        callback(new IndexedDBShadow(this._db, this.timestamp));
      }

    }; // countRequest.onsuccess

  }

  /**
   * @param {persistence.Drive.Detached.CallbackWithShadow} callback
   */
  purge(callback) {
    if (this._transaction) {
      this._transaction = void 0;
      setTimeout(() => { // avoid being in the original transaction
        this._purgeCore(callback);
      }, 1);
    }
    else {
      this._purgeCore(callback);
    }
  }

  /**
   * @param {persistence.Drive.Detached.CallbackWithShadow} callback
   */
  _purgeCore(callback) {
    var transaction = this._db.transaction(['files', 'metadata'], 'readwrite');

    var filesStore = transaction.objectStore('files');
    filesStore.clear();

    var metadataStore = transaction.objectStore('metadata');
    metadataStore.clear();

    callback(new IndexedDBShadow(this._db, -1));
  }

  // private _requestStores(storeNames: string[], readwrite: 'readwrite' | null, callback: (stores: IDBObjectStore[]) => void) {

  //   var stores: IDBObjectStore[] = [];

  //   var attemptPopulateStores = () => {
  //     if (transaction) {
  //       for (var i = 0; i < storeNames.length; i++) {
  //         stores[i] = transaction.objectStore(storeNames[i]);
  //       }
  //     }
  //   };

  //   try {
  //     var transaction = this._transaction;
  //     if (!transaction) {
  //       transaction = readwrite ? this._db.transaction(storeNames, readwrite) : this._db.transaction(storeNames);
  //       this._transaction = transaction;
  //     }
  //     attemptPopulateStores();
  //   }
  //   catch (error) {
  //     transaction = readwrite ? this._db.transaction(storeNames, readwrite) : this._db.transaction(storeNames);
  //     this._transaction = transaction;
  //     attemptPopulateStores();
  //   }
  // }

}

/**
 * @typedef {{
 * [file: string]: { content: string | null, encoding: string | undefined }
 * }} WriteSnapshot
 */

/**
 * @implements {persistence.Drive.Shadow}
 */
class IndexedDBShadow {

  _lastWrite = 0;
  /** @type {WriteSnapshot | null} */
  _conflatedWrites = null;

  /**
   * 
   * @param {IDBDatabase} _db
   * @param {number} [timestamp]
   */
  constructor(_db, timestamp) {
    this._db = _db;
    this.timestamp = timestamp;
  }

  /**
   * @param {string} file
   * @param {string | null} content
   * @param {string | undefined} encoding
   */
  write(file, content, encoding) {
    const now = Date.now ? Date.now() : +new Date();
    if (this._conflatedWrites || now-this._lastWrite<10) {
      if (!this._conflatedWrites) {
        this._conflatedWrites = {};
        setTimeout(() => {
          var writes = this._conflatedWrites;
          if (writes) {
            this._conflatedWrites = null;
            this._writeCore(writes);
          }
        }, 0);
      }
      this._conflatedWrites[file] = { content, encoding };
    }
    else {
      this._writeCore({ [file]: { content, encoding } });
    }
  }

  /**
   * @param {WriteSnapshot} writes
   */
  _writeCore(writes) {
    this._lastWrite = Date.now ? Date.now() : +new Date();
    const transaction = this._db.transaction(['files', 'metadata'], 'readwrite');
    const filesStore = transaction.objectStore('files');
    const metadataStore = transaction.objectStore('metadata');

    for (var file in writes) if (writes.hasOwnProperty(file)) {

      var entry = writes[file];

      // no file deletion here: we need to keep account of deletions too!
      const fileData = {
        path: file,
        content: entry.content,
        encoding: entry.encoding,
        state: null
      };

      const putFile = filesStore.put(fileData);
    }

    metadataStore.put({
      property: 'editedUTC',
      value: Date.now()
    });
  }

  /**
   * @param {string} file
   */
  forget(file) {
    const transaction = this._db.transaction(['files'], 'readwrite');
    const filesStore = transaction.objectStore('files');
    filesStore['delete'](file);
  }

}

/**
 * @typedef {{
 *  path: string;
 *  content: string | null;
 *  encoding: string | undefined;
 *  state: string | null;
 * }} FileData
 */

/**
 * @typedef {{
 *  property: string;
 *  value: any;
 * }} MetadataData
 */
