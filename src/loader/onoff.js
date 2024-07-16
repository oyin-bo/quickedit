// @ts-check

export function on(obj, eventName, callback) {

  if (obj.addEventListener) {
    try {
      obj.addEventListener(eventName, callback, false);
      return;
    }
    catch (e) { }
  }
  else if (obj.attachEvent) {
    try {
      obj.attachEvent('on' + eventName, callback);
      return;
    }
    catch (e) { }
  }

  obj['on' + eventName] = function(e) { return callback(e || window.event); };
} // on


// TODO: figure out when obj argument is skipped
export function off(obj, eventName, callback) {
  if (obj.removeEventListener) {
    obj.removeEventListener(eventName, callback, false);
  }
  else if (obj.detachEvent) {
    obj.detachEvent('on' + eventName, callback);
  }
  else {
    if (obj['on' + eventName])
      obj['on' + eventName] = null;
  }
} // off
