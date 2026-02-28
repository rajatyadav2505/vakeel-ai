import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function sanitizePlainText(input: string) {
  return input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/[<>]/g, '')
    .trim();
}

export function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function toOutcomeBand(value: number): 'Low' | 'Medium' | 'High' {
  if (value < 0.45) return 'Low';
  if (value < 0.7) return 'Medium';
  return 'High';
}
