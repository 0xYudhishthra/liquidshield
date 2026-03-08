import type { DefenseEvent } from "../../../shared/src/types";

/**
 * In-memory store for defense events.
 * Receives events from webhooks (RSC callbacks, defense notifications)
 * and serves them to the defenses route.
 */

const defenseEvents: DefenseEvent[] = [];

/** Add a defense event to the store. */
export function addDefenseEvent(event: DefenseEvent): void {
  defenseEvents.push(event);
}

/** Get all defense events, optionally filtered by address (positionId prefix match). */
export function getDefenseEvents(address?: string): DefenseEvent[] {
  if (!address) return [...defenseEvents];
  const lowerAddress = address.toLowerCase();
  return defenseEvents.filter(
    (e) => e.positionId.toLowerCase().includes(lowerAddress)
  );
}

/** Get defense events for a specific position ID. */
export function getDefenseEventsByPositionId(positionId: string): DefenseEvent[] {
  return defenseEvents.filter(
    (e) => e.positionId.toLowerCase() === positionId.toLowerCase()
  );
}

/** Get all stored defense events (no filter). */
export function getAllDefenseEvents(): DefenseEvent[] {
  return [...defenseEvents];
}

/** Clear all stored events (useful for testing). */
export function clearDefenseEvents(): void {
  defenseEvents.length = 0;
}
