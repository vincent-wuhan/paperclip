import { MAX_EVIDENCE_ITEMS, MAX_INCIDENTS, MAX_TIMELINE_ENTRIES } from "./constants.js";
import type { MirrorState, OpsKeeperIncident, OpsKeeperIncidentDetail, SyncResult } from "./types.js";
import { OpsKeeperReadOnlyClient } from "./client.js";

export const EMPTY_MIRROR: MirrorState = {
  cursor: null,
  lastSuccessAt: null,
  lastAttemptAt: null,
  lastError: null,
  stale: true,
  incidents: [],
  details: {}
};

export async function syncOnce(
  client: OpsKeeperReadOnlyClient,
  previous: MirrorState,
  now = new Date()
): Promise<SyncResult & { state: MirrorState }> {
  try {
    const list = await client.listIncidents(previous.cursor);
    const sourceIncidents = list.incidents.slice(0, MAX_INCIDENTS);
    const details: Record<string, OpsKeeperIncidentDetail> = {};
    for (const incident of sourceIncidents) {
      details[incident.id] = normalizeDetail(await client.getIncident(incident.id));
    }
    const incidentsById = new Map(previous.incidents.map((incident) => [incident.id, incident]));
    let upserted = 0;
    let unchanged = 0;
    for (const incident of sourceIncidents) {
      const old = incidentsById.get(incident.id);
      if (!old || old.payloadHash !== incident.payloadHash) {
        upserted += 1;
        incidentsById.set(incident.id, incident);
      } else {
        unchanged += 1;
      }
    }
    const mergedIncidents = [...incidentsById.values()].slice(0, MAX_INCIDENTS);
    const mergedDetails = { ...previous.details, ...details };
    const nextDetails: Record<string, OpsKeeperIncidentDetail> = {};
    for (const incident of mergedIncidents) {
      const detail = mergedDetails[incident.id];
      if (detail) nextDetails[incident.id] = normalizeDetail(detail);
    }
    const state: MirrorState = {
      cursor: list.nextCursor ?? previous.cursor,
      lastSuccessAt: now.toISOString(),
      lastAttemptAt: now.toISOString(),
      lastError: null,
      stale: false,
      incidents: mergedIncidents,
      details: nextDetails
    };
    return { upserted, unchanged, errored: false, nextCursor: state.cursor, state };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      upserted: 0,
      unchanged: 0,
      errored: true,
      error: message,
      nextCursor: previous.cursor,
      state: {
        ...previous,
        lastAttemptAt: now.toISOString(),
        lastError: message,
        stale: true
      }
    };
  }
}

function normalizeDetail(detail: OpsKeeperIncidentDetail): OpsKeeperIncidentDetail {
  return {
    ...detail,
    timeline: detail.timeline.slice(0, MAX_TIMELINE_ENTRIES),
    evidence: detail.evidence.slice(0, MAX_EVIDENCE_ITEMS)
  };
}
