import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getProgressColor(percentage: number): string {
  if (percentage >= 100) return "text-progress-good";
  if (percentage >= 50) return "text-progress-warning";
  return "text-progress-danger";
}

export function getProgressBgColor(percentage: number): string {
  if (percentage >= 100) return "bg-progress-good";
  if (percentage >= 50) return "bg-progress-warning";
  return "bg-progress-danger";
}

export function formatHours(hours: number): string {
  return hours % 1 === 0 ? hours.toString() : hours.toFixed(1);
}

export function getNextMonday(): Date {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + daysUntilMonday);
  nextMonday.setHours(0, 0, 0, 0);
  return nextMonday;
}

export function getWeekDates(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    return date;
  });
}

export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function formatDateDisplay(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
