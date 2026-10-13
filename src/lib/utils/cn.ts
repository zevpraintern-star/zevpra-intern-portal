import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Conditional class name helper used by every UI primitive.
 * tailwind-merge resolves conflicts so component variants can override classes
 * passed in by callers.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
