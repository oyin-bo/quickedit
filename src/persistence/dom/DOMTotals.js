// @ts-check

const monthsPrettyCase = ('Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec').split('|');
const monthsUpperCaseStr = monthsPrettyCase.join('').toUpperCase();

export class DOMTotals {

  // cache after updating DOM, to avoid unneeded updates
  _domTimestamp = -1;
  _domTotalSize = -1;

  /**
   * @param {number} timestamp
   * @param {number} totalSize
   * @param {Comment} node
   */
  constructor(timestamp, totalSize, node) {
    this.timestamp = timestamp;
    this.totalSize = totalSize;
    this.node = node;
  }

  updateNode() {

    if (this._domTimestamp === this.timestamp && this._domTotalSize === this.totalSize) return;

    // total 4Kb, saved 25 Apr 2015 22:52:01.231
    var newTotals =
      'total ' + formatDOMTotalsSize(this.totalSize) + ', ' +
      'saved ' + formatDOMTotalsDate(this.timestamp);

    if (!this.node) return newTotals;

    this.node.nodeValue = newTotals;
    this._domTimestamp = this.timestamp;
    this._domTotalSize = this.totalSize;
  }

}

const totalFmt_Regexp = /^\s*total\s+(\d*)\s*([KkMm])?b?\s*$/;
const savedFmt_Regexp = /^\s*saved\s+(\d+)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d+)(\s+(\d+)\:(\d+)(\:(\d+(\.(\d+))?))\s*(GMT\s*[\-\+]?\d+\:?\d*)?)?\s*$/i;

/**
 * @param {{
 *  header: string;
 *  contentOffset: number;
 *  contentLength: number;
 *  node: Comment;
 * }} cmheader 
 */
export function tryParseDOMTotals(cmheader) {

  // TODO: preserve unknowns when parsing

  const parts = cmheader.header.split(',');
  let anythingParsed = false;
  let totalSize = 0;
  let timestamp = 0;

  for (let i = 0; i < parts.length; i++) {

    // total 234Kb
    // total 23
    // total 6Mb

    const totalMatch = totalFmt_Regexp.exec(parts[i]);
    if (totalMatch) {
      try {
        let total = parseInt(totalMatch[1]);
        if ((totalMatch[2] + '').toUpperCase() === 'K')
          total *= 1024;
        else if ((totalMatch[2] + '').toUpperCase() === 'M')
          total *= 1024 * 1024;
        totalSize = total;
        anythingParsed = true;
      }
      catch (totalParseError) { }
      continue;
    }

    const savedMatch = savedFmt_Regexp.exec(parts[i]);
    if (savedMatch) {
      // 25 Apr 2015 22:52:01.231
      try {
        const savedDay = parseInt(savedMatch[1]);

        // first find string index within JANFEBMAR...NOVDEC then divide by three
        // which happens to be (0...11)*3
        let savedMonth = monthsUpperCaseStr.indexOf(savedMatch[2].toUpperCase());
        if (savedMonth >= 0 && savedMonth % 3 === 0)
          savedMonth = savedMonth / 3;

        let savedYear = parseInt(savedMatch[3]);
        if (savedYear < 100)
          savedYear += 2000; // no 19xx notation anymore :-(
        const savedHour = parseInt(savedMatch[5]);
        const savedMinute = parseInt(savedMatch[6]);
        const savedSecond = savedMatch[8] ? parseFloat(savedMatch[8]) : 0;

        if (savedMatch[4]) {
          timestamp = new Date(savedYear, savedMonth, savedDay, savedHour, savedMinute, savedSecond | 0).valueOf();
          timestamp += (savedSecond - (savedSecond | 0)) * 1000; // milliseconds

          const savedGMTStr = savedMatch[11];
          if (savedGMTStr) {
            var gmtColonPos = savedGMTStr.indexOf(':');
            if (gmtColonPos > 0) {
              var gmtH = parseInt(savedGMTStr.slice(0, gmtColonPos));
              timestamp += gmtH * 60 /*min*/ * 60 /*sec*/ * 1000 /*msec*/;
              var gmtM = parseInt(savedGMTStr.slice(gmtColonPos + 1));
              timestamp += gmtM * 60 /*sec*/ * 1000 /*msec*/;
            }
          }
        }
        else {
          timestamp = new Date(savedYear, savedMonth, savedDay).valueOf();
        }

        anythingParsed = true;
      }
      catch (savedParseError) { }
    }

  }

  if (anythingParsed)
    return new DOMTotals(timestamp, totalSize, cmheader.node);
}

/**
 * @param {number} totalSize
 */
export function formatDOMTotalsSize(totalSize) {
  return (
    totalSize < 1024 * 9 ? totalSize + '' :
      totalSize < 1024 * 1024 * 9 ? ((totalSize / 1024) | 0) + 'Kb' :
        ((totalSize / (1024 * 1024)) | 0) + 'Mb');
}

const tmpDate = new Date();

/**
 * @param {number} date
 */
export function formatDOMTotalsDate(date) {
  tmpDate.setTime(date);

  const dateLocalStr = tmpDate.toString();
  const gmtMatch = (/(GMT\s*[\-\+]\d+(\:\d+)?)/i).exec(dateLocalStr);

  const d = tmpDate.getDate();
  const MMM = monthsPrettyCase[tmpDate.getMonth()];
  const yyyy = tmpDate.getFullYear();
  const h = tmpDate.getHours();
  const m = tmpDate.getMinutes();
  const s = tmpDate.getSeconds();
  const ticks = +tmpDate;

  const formatted =
    d +
    ' ' + MMM +
    ' ' + yyyy +
    (h > 9 ? ' ' : ' 0') + h +
    (m > 9 ? ':' : ':0') + m +
    (s > 9 ? ':' : ':0') + s +
    '.' + (ticks).toString().slice(-3) +
    (gmtMatch && gmtMatch[1] !== 'GMT+0000' ? ' ' + gmtMatch[1] : '');

  return formatted;
}
