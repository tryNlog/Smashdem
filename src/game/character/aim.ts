import type { AimStep } from './types';

export const AIM_STEP_COUNT = 256;

export function isValidAimStep(value: number): value is AimStep {
  return Number.isInteger(value) && value >= 0 && value < AIM_STEP_COUNT;
}

/** Spec §8.2: the only combat helper converting an aim step to a direction. */
export function aimStepToUnit(step: AimStep): { readonly x: number; readonly y: number } {
  const radians = (step / AIM_STEP_COUNT) * Math.PI * 2;
  return { x: Math.cos(radians), y: Math.sin(radians) };
}