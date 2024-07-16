// @ts-check

import { base64, _btoa as base64Btoa, _atob as base64Atob } from './base64';
import { CR } from './CR';
import { CRLF } from './CRLF';
import { json } from './json';
import { LF } from './LF';

export const encodings = {
  base64,
  LF,
  CR,
  CRLF,
  json
};

export const _btoa = base64Btoa;
export const _atob = base64Atob;
