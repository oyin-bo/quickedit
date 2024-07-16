// @ts-check
/// <reference path="./timings.d.ts" />

import { BootState } from '../persistence';
import { createFrame } from './createFrame';
import { deriveUniqueKey } from './deriveUniqueKey';
import { removeSpyElements } from './removeSpyElements';
import { on } from './onoff';

let bootState;

/** @type {HTMLIFrameElement} */
let boot;

/** @type {HTMLIFrameElement} */
let shell;

/** @type {Function[]} */
let domNodeCallbacks;

/** @type {Function[]} */
let progressCallbacks;

/** @type {Function[]} */
let loadedCallbacks;

/** @type {Function[]} */
let resizeCallbacks;

/** @type {Function[]} */
let resizeReportCallbacks;

/** @type {string} */
let uniqueKey;

/** @type {BootState | undefined} */
let bootDrive;

/** @type {persistence.Drive} */
let drive;

let keepLoading;

export function startBoot() {
  if (typeof timings === 'undefined' || !timings) timings = { domStarted: Date.now() }
  else if (!timings.domStarted) timings.domStarted = Date.now();
  timings.scriptStart = +new Date();

  window.onerror = window_onerror;


  bootState = {};



  document.title = '.';

  removeSpyElements();

  document.title = ':';

  // creates both frames invisible
  boot = createFrame();
  boot.style.zIndex = '100';
  shell = createFrame();
  shell.style.zIndex = '10';

  document.title = '/';

  domNodeCallbacks = [];
  progressCallbacks = [];
  loadedCallbacks = [];
  resizeCallbacks = [];
  resizeReportCallbacks = [];

  uniqueKey = deriveUniqueKey(location);
  bootDrive = new BootState(document, uniqueKey);
  bootDrive.ondomnode = handle_dom_node;


  document.title = '/:';

  on(window, 'load', window_onload);

  keepLoading = setInterval(onkeeploading, 30);

  /**
   * @type {{ node: Node; recognizedKind: string | undefined; recognizedEntity: any; }[] | undefined}
   */
  var keepDomNodesUntilBootComplete;

  /**
   * @param {Node} node
   * @param {string | undefined} recognizedKind
   * @param {any} recognizedEntity
   */
  function handle_dom_node(node, recognizedKind, recognizedEntity) {
    if (!keepDomNodesUntilBootComplete) keepDomNodesUntilBootComplete = [];
    keepDomNodesUntilBootComplete.push({ node, recognizedKind, recognizedEntity });
    for (var i = 0; i < domNodeCallbacks.length; i++) {
      var callback = domNodeCallbacks[i];
      callback(node, recognizedKind, recognizedEntity);
    }

  }

  function onkeeploading() {

    if (document.title === '/:') document.title = '/:.';
    if (!timings.domStarted
      && (bootDrive.domLoadedSize || bootDrive.domTotalSize))
      timings.domStarted = +new Date();

    removeSpyElements();

    var goodTimeUpdateSize = false;
    var now = Date.now ? Date.now() : +new Date();
    if (!(onkeeploading)._lastUpdateSize) {
      goodTimeUpdateSize = true;
    }
    else {
      if (now - (onkeeploading)._lastUpdateSize > 500)
        goodTimeUpdateSize = true;
    }

    if (goodTimeUpdateSize) {
      (onkeeploading)._lastUpdateSize = now;
      sz.update();
    }

    var prevLoadedSize = bootDrive.domLoadedSize;
    var prevTotalSize = bootDrive.domTotalSize;

    bootDrive.continueLoading();
    updateBootStateProps();

    if (bootDrive.newDOMFiles.length || bootDrive.newStorageFiles.length
      || prevLoadedSize !== bootDrive.domLoadedSize || prevTotalSize !== bootDrive.domTotalSize) {
      if (document.title === '/:' || document.title === '/:.') document.title = '//';

      for (var i = 0; i < progressCallbacks.length; i++) {
        var callback = progressCallbacks[i];
        callback(bootDrive);
      }
    }

  }


  function window_onload() {

    function onfinishloading(loadedDrive) {
      drive = loadedDrive;
      if (typeof loader !== 'undefined' && loader) loader.drive = loadedDrive;

      updateBootStateProps();
      bootState.read = function (file) { return drive.read(file); };
      keepDomNodesUntilBootComplete = [];
      domNodeCallbacks = [];

      timings.driveLoaded = +new Date();
      if (loadedCallbacks && loadedCallbacks.length) {
        if (document.title === '/:' || document.title === '/:.' || document.title === '//') document.title = '//.';
        for (var i = 0; i < loadedCallbacks.length; i++) {
          var callback = loadedCallbacks[i];
          callback(drive);
        }
      }
      else {
        if (document.title === '/:' || document.title === '/:.' || document.title === '//') document.title = '//,';
        fadeToUI();
      }
    }

    clearInterval(keepLoading);

    removeSpyElements();

    timings.documentLoaded = +new Date();

    sz.update();

    bootDrive.finishParsing(onfinishloading);

  }
}

function window_onerror() {
  var msg = 'UNHANDLED';
  for (var i = 0; i < arguments.length; i++) {
    var a = arguments[i];
    try {
      if (a && typeof a === 'object') {
        if (a.constructor && a.constructor.name && a.constructor.name !== 'Object') msg += '\n{' + a.constructor.name + ':';
        else msg += '\n{';
        for (var k in a) if (a[k] && typeof a[k] !== 'function' && !String[k]) {
          try {
            msg += '\n  ' + k + ': ' + a[k];
          }
          catch (err) { msg += '\n  ' + k + ': [##' + err.message + ']'; }
        }
        msg += ' }';
      }
      else {
        msg += '\n' + a;
      }
    }
    catch (err) { msg += '[##' + err.message + ']'; }
  }

  alert(msg);
}
