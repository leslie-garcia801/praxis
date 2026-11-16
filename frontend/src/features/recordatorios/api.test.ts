import { describe, expect, it } from 'vitest';
import { urlBase64ToUint8Array } from './api';

describe('urlBase64ToUint8Array (RF-28)', () => {
  it('RF-28: converts a base64url VAPID key (no padding, - and _) to bytes', () => {
    // 0xfb 0xff 0xfe in base64url is "-__-" ('+/' alphabet: "+//+")
    expect(Array.from(urlBase64ToUint8Array('-__-'))).toEqual([0xfb, 0xff, 0xfe]);
    // "AQID" = 1, 2, 3; "AQI" is the same bytes without padding
    expect(Array.from(urlBase64ToUint8Array('AQI'))).toEqual([1, 2]);
  });
});
