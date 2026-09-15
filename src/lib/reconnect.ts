/** Exponential backoff for auto-reconnect (1s, 2s, 4s, 8s cap). */
export function reconnectDelayMs(attempt: number): number {
  return Math.min(1000 * 2 ** Math.max(0, attempt - 1), 8000)
}

export const MAX_RECONNECT_ATTEMPTS = 5
