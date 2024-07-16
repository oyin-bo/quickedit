// @ts-check

import { detect as detectIndexedDB } from './indexedDB';
import { detect as detectLocalStorage } from './localStorage';

/**
 * @type {persistence.Drive.Optional[]}
 */
export const attachedStorageOptions = [
  {
    name: 'indexedDB',
    detect: detectIndexedDB
  },
  {
    name: 'localStorage',
    detect: detectLocalStorage
  }
];
