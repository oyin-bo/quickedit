// @ts-check

import { bestEncode } from '../bestEncode';
import { encodings } from '../encodings';

/**
 * @property {Comment} node
 * @property {string} path
 * @property {number} contentLength
 */
export class DOMFile {

  /** @type {string | null} */
  _encodedPath = null;

  /**
   * 
   * @param {Comment} node
   * @param {string} path
   * @param {((text: string) => any) | null | undefined} _encoding
   * @param {number} _contentOffset
   * @param {number} contentLength
   */
  constructor(node, path, _encoding, _contentOffset, contentLength) {
    this.node = node;
    this.path = path;
    this._encoding = _encoding;
    this._contentOffset = _contentOffset;
    this.contentLength = contentLength;
  }

  read() {

    // proper HTML5 has substringData to read only a chunk
    // (that saves on string memory allocations
    // comparing to fetching the whole text including the file name)
    const contentText = typeof this.node.substringData === 'function' ?
      this.node.substringData(this._contentOffset, 1000000000) :
      (this.node.nodeValue || '').slice(this._contentOffset);

    // XML end-comment is escaped when stored in DOM,
    // unescape it back
    const restoredText = contentText.
      replace(/\-\-\*(\**)\>/g, '--$1>').
      replace(/\<\*(\**)\!/g, '<$1!');

    // decode
    const decodedText = this._encoding?.(restoredText);

    // update just in case it's been off
    if (typeof decodedText === 'string')
      this.contentLength = decodedText.length;

    return decodedText;
  }

  /**
   * @param {*} content
   * @param {string} [encoding]
   */
  write(content, encoding) {

    content =
      content===null || typeof content === 'undefined' ? content :
      String(content);

    var encoded = encoding ? { content, encoding } : bestEncode(content);
    var protectedText = encoded.content.
    replace(/\-\-(\**)\>/g, '--*$1>').
    replace(/\<(\**)\!/g, '<*$1!');

    if (!this._encodedPath) {
      // most cases path is path,
      // but if anything is weird, it's going to be quoted
      // (actually encoded with JSON format)
      var encp = bestEncode(this.path, true /*escapePath*/);
      this._encodedPath = encp.content;
    }

    var leadText = ' ' + this._encodedPath + (encoded.encoding === 'LF' ? '' : ' [' + encoded.encoding + ']') + '\n';
    var html = leadText + protectedText;
    if (!this.node) return html; // can be used without backing 'node' for formatting purpose

    if (html===this.node.nodeValue) return false;
    this.node.nodeValue = html;

    this._encoding = encodings[encoded.encoding || 'LF'];
    this._contentOffset = leadText.length;

    this.contentLength = content.length;
    return true;
  }

}

const parseFmt_Regexp = /^\s*((\/|\"\/)(\s|\S)*[^\]])\s*(\[((\s|\S)*)\])?\s*$/;

/**
 * @param {{
 *  header: string;
 *  contentOffset: number;
 *  contentLength: number;
 *  node: Comment;
 * }} cmheader
 */
export function tryParseDOMFile(cmheader) {

  //    /file/path/continue
  //    "/file/path/continue"
  //    /file/path/continue   [encoding]

  const parsed = parseFmt_Regexp.exec(cmheader.header);
  if (!parsed) return; // does not match the format

  let filePath = parsed[1];
  const encodingName = parsed[5];

  if (filePath.charAt(0) === '"') {
    if (filePath.charAt(filePath.length - 1) !== '"') return null; // unpaired leading quote
    try {
      if (typeof JSON !== 'undefined' && typeof JSON.parse === 'function')
        filePath = JSON.parse(filePath);
      else
        filePath = eval(filePath); // security doesn't seem to be compromised, input is coming from the same file
    }
    catch (parseError) {
      return null; // quoted path but wrong format (JSON expected)
    }
  }
  else { // filePath NOT started with quote
    if (encodingName) {
      // regex above won't strip trailing whitespace from filePath if encoding is specified
      // (because whitespace matches 'non-bracket' class too)
      filePath = filePath.slice(0, filePath.search(/\S(\s*)$/) + 1);
    }
  }

  var encoding = encodings[encodingName || 'LF'];
  // invalid encoding considered a bogus comment, skipped
  if (encoding)
    return new DOMFile(cmheader.node, filePath, encoding, cmheader.contentOffset, cmheader.contentLength);
}
