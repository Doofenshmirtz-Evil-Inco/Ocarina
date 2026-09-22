import { describe, expect, it } from 'vitest';
import { getPastelColor } from './supabaseService';

describe('pastel identity colors', () => {
  it('is deterministic for the same username', () => {
    expect(getPastelColor('Arun')).toBe(getPastelColor('Arun'));
  });

  it('changes with the username', () => {
    expect(getPastelColor('Arun')).not.toBe(getPastelColor('Maya'));
  });

  it('always uses the pastel HSL constraints', () => {
    expect(getPastelColor('listener')).toMatch(/^hsl\(\d+, 70%, 85%\)$/);
  });

  it('handles an empty guest name', () => {
    expect(getPastelColor()).toBe('hsl(0, 70%, 85%)');
  });
});
