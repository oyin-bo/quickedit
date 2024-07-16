// @ts-check

const multislash_Regexp = /\/\/*/g;

/**
 * @param {string} path
 */
export function normalizePath(path) {

  if (!path) return '/'; // empty paths converted to root

  if (path.charAt(0) !== '/') // ensuring leading slash
    path = '/' + path;

  path = path.replace(multislash_Regexp, '/'); // replacing duplicate slashes with single

  return path;
}