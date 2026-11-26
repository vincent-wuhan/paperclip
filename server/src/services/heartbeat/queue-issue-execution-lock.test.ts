import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  agents,
  agentWakeupRequests,
  authUsers,
  companies,
  companyMemberships,
  createDb,
  EMBEDDED_POSTGRES_TEST_TIMEOUT_MS,
  heartbeatRuns,
  issues,
} from "@paperclipai/db";
import { resolveExternalTestDatabaseUrl } from "../../__tests__/helpers/external-test-database.js";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "../../__tests__/helpers/embedded-postgres.js";
import { createHeartbeatQueueTestDependencies as callbacks } from "../../__tests__/helpers/heartbeat-queue.js";
import {
  createHeartbeatQueue,
  runIssueExecutionLock,
  RUN_ISSUE_EXECUTION_LOCK_KEY,
} from "./queue.js";

describe("run issue execution lock classification", () => {
  it("reports no lock for a run without an issue", () => {
    expect(runIssueExecutionLock({ issueId: null, executionRunId: null, runId: "run-1" })).toBe("none");
    expect(runIssueExecutionLock({ issueId: "  ", executionRunId: "run-1", runId: "run-1" })).toBe("none");
  });

  it("reports the lock only when the run owns the issue execution slot", () => {
    expect(runIssueExecutionLock({ issueId: "issue-1", executionRunId: "run-1", runId: "run-1" })).toBe("held");
    expect(runIssueExecutionLock({ issueId: "issue-1", executionRunId: "run-2", runId: "run-1" })).toBe("none");
    expect(runIssueExecutionLock({ issueId: "issue-1", executionRunId: null, runId: "run-1" })).toBe("none");
  });
});

const external = resolveExternalTestDatabaseUrl("PAPERCLIP_QUEUE_TEST_DATABASE_URL");
const support = external ? { supported: true, reason: undefined } : await getEmbeddedPostgresTestSupport();
if (!support.supported) console.warn(`Skipping issue execution lock tests: ${support.reason}`);
describe.skipIf(!support.supported)("heartbeat run issue execution lock marker", () => {
  let database: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | undefined;
  let db: Awaited<ReturnType<typeof createDb>>;

  beforeAll(async () => {
    if (!external) database = await startEmbeddedPostgresTestDatabase("paperclip-issue-execution-lock-marker");
    db = createDb(external ?? database!.connectionString, { maxConnections: 4 });
  }, EMBEDDED_POSTGRES_TEST_TIMEOUT_MS);

  afterAll(async () => {
    await db?.$client.end();
    await database?.cleanup();
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table companies restart identity cascade`);
  });

  async function insertCompanyWithOwner() {
    const userId = `lock-marker-owner-${randomUUID()}`;
    await db.insert(authUsers).values({
      id: userId,
      name: "Lock marker owner",
      email: `${userId}@paperclip.test`,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const [company] = await db.insert(companies).values({
      name: "Execution lock marker",
      issuePrefix: "LM",
    }).returning();
    await db.insert(companyMemberships).values({
      companyId: company.id,
      principalType: "user",
      principalId: userId,
      status: "active",
      membershipRole: "owner",
    });
    const [agent] = await db.insert(agents).values({
      companyId: company.id,
      name: "Lock marker agent",
      status: "idle",
      adapterType: "process",
      adapterConfig: {},
      runtimeConfig: { heartbeat: { enabled: true, intervalSec: 60, wakeOnDemand: true } },
    }).returning();
    return { company, agent, userId };
  }

  async function insertQueuedRun(
    companyId: string,
    agentId: string,
    contextSnapshot: Record<string, unknown>,
    responsibleUserId: string,
  ) {
    const wakeupRequestId = randomUUID();
    const runId = randomUUID();
    await db.insert(agentWakeupRequests).values({
      id: wakeupRequestId,
      companyId,
      agentId,
      source: "on_demand",
      triggerDetail: "manual",
      status: "queued",
      requestedByActorType: "user",
      requestedByActorId: responsibleUserId,
      runId,
    });
    await db.insert(heartbeatRuns).values({
      id: runId,
      companyId,
      agentId,
      scopeKind: contextSnapshot.issueId ? "issue" : "company",
      issueId: typeof contextSnapshot.issueId === "string" ? contextSnapshot.issueId : null,
      invocationSource: "on_demand",
      triggerDetail: "manual",
      status: "queued",
      responsibleUserId,
      wakeupRequestId,
      contextSnapshot,
      createdAt: new Date(),
    });
    return { runId, wakeupRequestId };
  }

  async function readMarker(runId: string) {
    const [row] = await db
      .select({ contextSnapshot: heartbeatRuns.contextSnapshot })
      .from(heartbeatRuns)
      .where(sql`${heartbeatRuns.id} = ${runId}`);
    const snapshot = (row?.contextSnapshot ?? {}) as Record<string, unknown>;
    return snapshot[RUN_ISSUE_EXECUTION_LOCK_KEY];
  }

  it("marks a company-scope run as holding no issue execution lock", async () => {
    const { company, agent, userId } = await insertCompanyWithOwner();
    const deps = callbacks(db);
    deps.getAgent.mockResolvedValue(agent);
    const queue = createHeartbeatQueue(db, deps);
    const { runId } = await insertQueuedRun(company.id, agent.id, { wakeReason: "heartbeat_timer" }, userId);

    const claimed = await queue.claimQueuedRun(
      (await db.select().from(heartbeatRuns).where(sql`${heartbeatRuns.id} = ${runId}`))[0],
    );

    expect(claimed).not.toBeNull();
    expect(await readMarker(runId)).toBe("none");
  });

  it("marks an issue-scoped run that owns the lock as holding it", async () => {
    const { company, agent, userId } = await insertCompanyWithOwner();
    const [issue] = await db.insert(issues).values({
      companyId: company.id,
      title: "Assigned work",
      status: "in_progress",
      assigneeAgentId: agent.id,
    }).returning();
    const deps = callbacks(db);
    deps.getAgent.mockResolvedValue(agent);
    const queue = createHeartbeatQueue(db, deps);
    const { runId } = await insertQueuedRun(
      company.id,
      agent.id,
      { issueId: issue.id, wakeReason: "issue_assigned" },
      userId,
    );

    const claimed = await queue.claimQueuedRun(
      (await db.select().from(heartbeatRuns).where(sql`${heartbeatRuns.id} = ${runId}`))[0],
    );

    expect(claimed).not.toBeNull();
    expect(await readMarker(runId)).toBe("held");
    const [locked] = await db.select({ executionRunId: issues.executionRunId }).from(issues)
      .where(sql`${issues.id} = ${issue.id}`);
    expect(locked?.executionRunId).toBe(runId);
  });

  it("marks a run that does not own the issue lock as holding none", async () => {
    const { company, agent, userId } = await insertCompanyWithOwner();
    const [issue] = await db.insert(issues).values({
      companyId: company.id,
      title: "Someone else's work",
      status: "in_progress",
      assigneeAgentId: agent.id,
    }).returning();
    const deps = callbacks(db);
    deps.getAgent.mockResolvedValue(agent);
    const queue = createHeartbeatQueue(db, deps);
    const { runId } = await insertQueuedRun(
      company.id,
      agent.id,
      { issueId: issue.id, wakeReason: "source_scoped_recovery_action" },
      userId,
    );

    const claimed = await queue.claimQueuedRun(
      (await db.select().from(heartbeatRuns).where(sql`${heartbeatRuns.id} = ${runId}`))[0],
    );

    expect(claimed).not.toBeNull();
    // The recovery-action wake works on the issue without owning its lock.
    expect(await readMarker(runId)).toBe("none");
    const [locked] = await db.select({ executionRunId: issues.executionRunId }).from(issues)
      .where(sql`${issues.id} = ${issue.id}`);
    expect(locked?.executionRunId).toBeNull();
  });
});
