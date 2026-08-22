/**
 * Minimal pure functions for node:test demonstration.
 * These have no I/O and are verified without external dependencies.
 */

/**
 * Returns the sum of two numbers without side effects.
 */
export function add(a: number, b: number): number {
  return a + b;
}

/**
 * Returns true if the value is a finite non-negative integer.
 */
export function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && Number.isFinite(value) && value >= 0;
}
