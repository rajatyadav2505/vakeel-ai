import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { v4 as uuidv4 } from 'uuid';

/**
 * Merge class names with Tailwind CSS conflict resolution.
 * Combines clsx for conditional classes with tailwind-merge
 * to properly handle Tailwind utility class conflicts.
 *
 * @example
 *   cn('px-4 py-2', isActive && 'bg-blue-500', 'px-6')
 *   // => 'py-2 bg-blue-500 px-6'  (px-4 is overridden by px-6)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format a date string or timestamp for display.
 * Handles ISO strings, date strings (YYYY-MM-DD), and Unix timestamps.
 *
 * @param date - A date string, ISO string, or Unix timestamp in milliseconds
 * @param options - Intl.DateTimeFormat options (defaults to medium date format)
 * @returns Formatted date string, or 'N/A' if input is falsy/invalid
 *
 * @example
 *   formatDate('2025-03-15')            // => 'Mar 15, 2025'
 *   formatDate(1710460800000)            // => 'Mar 15, 2024'
 *   formatDate('2025-03-15', { dateStyle: 'full' })
 *   // => 'Saturday, March 15, 2025'
 */
export function formatDate(
  date: string | number | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!date) return 'N/A';

  try {
    const dateObj = date instanceof Date ? date : new Date(date);

    if (isNaN(dateObj.getTime())) {
      return 'N/A';
    }

    const defaultOptions: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    };

    return new Intl.DateTimeFormat('en-IN', options ?? defaultOptions).format(dateObj);
  } catch {
    return 'N/A';
  }
}

/**
 * Generate a new UUID v4 identifier.
 *
 * @returns A new UUID string (e.g., '550e8400-e29b-41d4-a716-446655440000')
 */
export function generateId(): string {
  return uuidv4();
}

/**
 * Safely parse a JSON string with a fallback value.
 * Returns the fallback if the input is null, undefined, empty, or not valid JSON.
 *
 * @param json - The JSON string to parse
 * @param fallback - The value to return if parsing fails (defaults to null)
 * @returns The parsed value, or the fallback
 *
 * @example
 *   parseJSON('{"a":1}')           // => { a: 1 }
 *   parseJSON('invalid', [])       // => []
 *   parseJSON(null, {})            // => {}
 *   parseJSON(undefined)           // => null
 */
export function parseJSON<T>(json: string | null | undefined, fallback: T): T;
export function parseJSON<T>(json: string | null | undefined): T | null;
export function parseJSON<T>(json: string | null | undefined, fallback?: T): T | null {
  if (!json || json.trim() === '') {
    return fallback ?? null;
  }

  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback ?? null;
  }
}

/**
 * Format a relative time string from a timestamp.
 *
 * @param timestamp - Unix timestamp in milliseconds or a Date
 * @returns A human-readable relative time string (e.g., '2 hours ago')
 */
export function timeAgo(timestamp: number | Date): string {
  const now = Date.now();
  const time = timestamp instanceof Date ? timestamp.getTime() : timestamp;
  const diff = now - time;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`;
  if (weeks < 5) return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
  return `${months} month${months !== 1 ? 's' : ''} ago`;
}

/**
 * Truncate a string to a maximum length, appending an ellipsis if truncated.
 *
 * @param str - The string to truncate
 * @param maxLength - Maximum length (default 100)
 * @returns The truncated string
 */
export function truncate(str: string | null | undefined, maxLength: number = 100): string {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 1) + '\u2026';
}

/**
 * Convert a case status to a display-friendly color class.
 */
export function statusColor(status: string): string {
  const colors: Record<string, string> = {
    active: 'text-green-600 bg-green-50',
    pending: 'text-yellow-600 bg-yellow-50',
    closed: 'text-gray-600 bg-gray-50',
    won: 'text-emerald-600 bg-emerald-50',
    lost: 'text-red-600 bg-red-50',
    scheduled: 'text-blue-600 bg-blue-50',
    completed: 'text-green-600 bg-green-50',
    adjourned: 'text-orange-600 bg-orange-50',
    draft: 'text-gray-600 bg-gray-50',
    review: 'text-yellow-600 bg-yellow-50',
    final: 'text-green-600 bg-green-50',
    running: 'text-blue-600 bg-blue-50',
    paused: 'text-yellow-600 bg-yellow-50',
  };

  return colors[status] ?? 'text-gray-600 bg-gray-50';
}
