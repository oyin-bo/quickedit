// @ts-check

export function createFrame() {
  /** @type {HTMLIFrameElement & { application?, __knownFrame?, window? }} */
  const iframe = document.createElement('iframe');
  iframe.application='yes'; // MHTA trusted
  iframe.__knownFrame = true;
  iframe.style.cssText =
    'position:absolute; ' +
    'left: 0; top: 0; width: 100 %; height: 100 %; ' +
    'border: none; display: none; padding: 0px; margin: 0px; ';

  iframe.src = 'about:blank';
  iframe.frameBorder = '0';
  document.body.appendChild(iframe);

  let ifrwin = iframe.contentWindow;
  if (!ifrwin) {
    // IE567 - try to make it behave
    try { /** @type {*} */(iframe).contentWindow = ifrwin = iframe.window; }
    catch (err) { }
  }

  let ifrdoc = /** @type {typeof window.document} */(iframe.contentDocument);
  if (!ifrdoc)
    ifrdoc = /** @type {*} */(ifrwin).document;

  if (ifrdoc.open) ifrdoc.open();
  ifrdoc.write(
    '<'+'!doctype html><' + 'html><' + 'head><' + 'style>' +
    'html{margin:0;padding:0;border:none;height:100%;border:none;overflow:hidden;}' +
    'body{margin:0;padding:0;border:none;height:100%;border:none;overflow:hidden;}' +
    '*,*:before,*:after{box-sizing:inherit;}' +
    'html{box-sizing:border-box;}' +
    '</' + 'style><' + 'body>'+
    '<' + 'body></' + 'html>');
  if (ifrdoc.close) ifrdoc.close();

  return iframe;
} // createFrame
