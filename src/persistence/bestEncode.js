// @ts-check

import { _btoa, encodings } from './encodings';

/**
 * @param {any} content
 * @param {boolean} [escapePath]
 */
export function bestEncode(content, escapePath) {

  if (content.length>1024*2) {
    /*
    var compressed = encodings.lzma.compress(content);
    var str = '';
    for (var i = 0; i < compressed.length; i++) {
      str += String.fromCharCode((compressed[i] + 256) % 256);
    }
    var b64 = encodings.base64.btoa(str);
    if (typeof content !== 'string')
      b64 = '*' + b64;
    else
      b64 = 'A' + b64;
    if (b64.length<content.length)
      return {content:b64, encoding: 'lzma'};
      */
  }

  if (typeof content!=='string') {
    if (typeof content==='object' && typeof content.length==='number'
        && content.length>16 && typeof content[0]==='number') {
      try {
        return { content: encodeNumberArrayToBase64(content), encoding: 'base64' };
      }
      catch (base64Error) { }
    }
    return { content: encodeArrayOrSimilarAsJSON(content), encoding: 'json' };
  }

  var maxEscape = ((content.length * 0.1) | 0) + 2;

  let escape = 0;
  let escapeHigh = 0;
  let prevChar = 0;
  let crCount = 0;
  let lfCount = 0;
  let crlfCount = 0;

  if (escapePath) {
    for (let i = 0; i < content.length; i++) {
      const c = content.charCodeAt(i);
      if (c < 32 || c >126 || (c===32 && (!i || i===content.length-1))) {
        escape = 1;
        break;
      }
    }
  }
  else {
    for (let i = 0; i < content.length; i++) {
      const c = content.charCodeAt(i);

      if (c===10) {
        if (prevChar===13) {
          crCount--;
          crlfCount++;
        }
        else {
          lfCount++;
        }
      }
      else if (c===13) {
        crCount++;
      }
      else if (c<32 && c!=9) { // tab is an OK character, no need to escape
        escape++;
      }
      else if (c>126) {
        escapeHigh++;
      }

      prevChar = c;

      if ((escape+escapeHigh) > maxEscape)
        break;
    }
  }

  if (escapePath) {
    if (escape)
      return { content: _encodeUnusualStringAsJSON(content), encoding: 'json' };
    else
      return { content: content, encoding: 'LF' };
  }
  else {
    if (escape > maxEscape) {
      return { content: _encodeUnusualStringAsJSON(content), encoding: 'json' };
    }

    else if (escape)
      return { content: _encodeUnusualStringAsJSON(content), encoding: 'json' };
    else if (crCount) {
      if (lfCount)
        return { content: _encodeUnusualStringAsJSON(content), encoding: 'json' };
      else
        return { content: content, encoding: 'CR' };
    }
    else if (crlfCount) {
      if (lfCount)
        return { content: _encodeUnusualStringAsJSON(content), encoding: 'json' };
      else
        return { content: content, encoding: 'CRLF' };
    }
    else {
      return { content: content, encoding: 'LF' };
    }
  }

}

/**
 * @param {string} content
 */
function _encodeUnusualStringAsJSON(content) {
  if (typeof JSON !== 'undefined' && typeof JSON.stringify === 'function') {
    const simpleJSON = JSON.stringify(content);
    const sanitizedJSON = simpleJSON.
      replace(/\u0000/g, '\\u0000').
      replace(/\r/g, '\\r').
      replace(/\n/g, '\\n');
    return sanitizedJSON;
  }
  else {
    const result = content.replace(
      /\"\u0000|\u0001|\u0002|\u0003|\u0004|\u0005|\u0006|\u0007|\u0008|\u0009|\u00010|\u00011|\u00012|\u00013|\u00014|\u00015|\u0016|\u0017|\u0018|\u0019|\u0020|\u0021|\u0022|\u0023|\u0024|\u0025|\u0026|\u0027|\u0028|\u0029|\u0030|\u0031/g,
      (chr) =>
      chr === '\t' ? '\\t' :
      chr === '\r' ? '\\r' :
      chr === '\n' ? '\\n' :
      chr === '\"' ? '\\"' :
      chr < '\u0010' ? '\\u000' + chr.charCodeAt(0).toString(16) :
      '\\u00' + chr.charCodeAt(0).toString(16));
    return result;
  }
}

/**
 * @param {number[]} content
 */
function encodeNumberArrayToBase64(content) {
  var str = '';
  for (var i = 0; i < content.length; i++) {
    str += String.fromCharCode(content[i]);
  }
  var b64 = '*'+ _btoa(str);
  return b64;
}

function encodeArrayOrSimilarAsJSON(content) {
  var type = content instanceof Array ? null : content.constructor.name || content.type;
  if (typeof JSON !== 'undefined' && typeof JSON.stringify === 'function') {
    if (type) {
      var wrapped = { type, content };
      var wrappedJSON = JSON.stringify(wrapped);
      return wrappedJSON;
    }
    else {
      var contentJSON = JSON.stringify(content);
      return contentJSON;
    }
  }
  else {
    /** @type {string[]} */
    var jsonArr = [];
    if (type) {
      jsonArr.push('{"type": "');
      jsonArr.push(content.type || content.prototype.constructor.name);
      jsonArr.push('", "content": [');
    }
    else {
      jsonArr.push('[');
    }

    for (var i = 0; i < content.length; i++) {
      if (i) jsonArr.push(',');
      jsonArr.push(content[i]);
    }

    if (type)
      jsonArr.push(']}');
    else
      jsonArr.push(']');

    return jsonArr.join('');
  }
}
