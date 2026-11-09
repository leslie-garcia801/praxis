import { describe, expect, it } from 'vitest';
import { META_HORAS, metaMinutos } from './programas.js';

describe('RN-02: meta de horas por tipo de programa', () => {
  it('RN-02: servicio social requiere 480 horas', () => {
    expect(META_HORAS.SERVICIO_SOCIAL).toBe(480);
  });

  it('RN-02: prácticas profesionales requieren 240 horas', () => {
    expect(META_HORAS.PRACTICAS).toBe(240);
  });

  it('RN-02: converts the goal to whole minutes', () => {
    expect(metaMinutos('SERVICIO_SOCIAL')).toBe(28_800);
    expect(metaMinutos('PRACTICAS')).toBe(14_400);
  });
});
