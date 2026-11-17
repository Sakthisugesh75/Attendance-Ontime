/**
 * Pure reach helpers (no server imports) so they can be unit-tested and shared by the
 * session checks and the notification recipients.
 */
import type { Scope } from "./permissions";

/** One employee and who they report to. */
export interface ManagerLink {
  id: number;
  managerId: number | null;
}

/**
 * The root employee plus everyone reporting to them, directly or through others.
 * Cycles in the reporting lines (A → B → A) are safe: each person is visited once.
 */
export function teamIds(links: ManagerLink[], rootId: number): number[] {
  const reports = new Map<number, number[]>();
  for (const e of links) if (e.managerId !== null && e.managerId !== e.id) reports.set(e.managerId, [...(reports.get(e.managerId) ?? []), e.id]);
  const team = new Set<number>([rootId]);
  const queue = [rootId];
  while (queue.length) {
    for (const id of reports.get(queue.shift()!) ?? []) {
      if (!team.has(id)) {
        team.add(id);
        queue.push(id);
      }
    }
  }
  return [...team];
}

/**
 * Employee ids a user reaches: null = everyone (Super Admin or scope ALL); TEAM = their team
 * (see teamIds); SELF = only themselves. A user without an employee record reaches nobody
 * unless their scope is ALL.
 */
export function reachIds(access: { isSuperAdmin: boolean; scope: Scope }, employeeId: number | null, links: ManagerLink[]): number[] | null {
  if (access.isSuperAdmin || access.scope === "ALL") return null;
  if (!employeeId) return [];
  if (access.scope === "SELF") return [employeeId];
  return teamIds(links, employeeId);
}

/** True when `employeeId` is within a reach returned by reachIds. */
export const inReach = (reach: number[] | null, employeeId: number) => reach === null || reach.includes(employeeId);
