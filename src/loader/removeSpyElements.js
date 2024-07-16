// @ts-check

/**
 * @param {(HTMLElement | undefined | null)[]} [ignoreElements]
 */
export function removeSpyElements(ignoreElements) {

  removeElementsByTagName('iframe', ignoreElements);
  removeElementsByTagName('style', ignoreElements);
  removeElementsByTagName('script', ignoreElements);
}

/**
 * @param {string} tagName
 * @param {(HTMLElement | undefined | null)[]} [ignoreElements]
 */
function removeElementsByTagName(tagName, ignoreElements) {
  var list = document.getElementsByTagName(tagName);
  for (let i = 0; i < list.length; i++) {
    const elem = /** @type {HTMLElement} */(list[i] || list.item(i));

    if (/** @type {*} */(elem).__knownFrame) continue;

    if (elem && elem.parentElement && elem.getAttribute && elem.getAttribute('data-legit')) {
      if (ignoreElements?.length && ignoreElements.indexOf(elem) >= 0) continue;
      try {
        elem.parentElement.removeChild(elem);
        i--;
      } catch (error) { }
    }
  }
}
