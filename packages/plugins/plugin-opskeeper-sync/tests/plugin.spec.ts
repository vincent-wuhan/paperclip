import { describe, expect, it, vi } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import { JOB_KEY } from "../src/constants.js";
import plugin from "../src/worker.js";

describe("OpsKeeper read-only plugin", () => {
  it("declares only the current Phase A capabilities", () => {
    expect(manifest.capabilities).not.toContain("approvals.respond");
    expect(manifest.capabilities).not.toContain("issues.update");
    expect(manifest.capabilities).toContain("http.outbound");
    expect(manifest.capabilities).toContain("plugin.state.write");
  });

  it("registers data, action, job, and read-only tools", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        opskeeperBaseUrl: "https://opskeeper.example",
        allowInsecureHttp: false
      }
    });
    await plugin.definition.setup(harness.ctx);
    await harness.ctx.state.set(
      { scopeKind: "company", scopeId: "company-1", stateKey: "mirror" },
      {
        cursor: null,
        lastSuccessAt: "2020-01-01T00:00:00Z",
        lastAttemptAt: null,
        lastError: null,
        stale: false,
        incidents: [],
        details: {}
      }
    );
    await expect(harness.getData("opskeeper-incidents", { companyId: "company-1" })).resolves.toMatchObject({
      stale: true,
      incidents: []
    });
    await expect(plugin.definition.onValidateConfig?.({
      opskeeperBaseUrl: "https://opskeeper.example"
    })).resolves.toEqual({ ok: true });
    await expect(plugin.definition.onValidateConfig?.({
      opskeeperBaseUrl: "http://opskeeper.example"
    })).resolves.toMatchObject({ ok: false });
  });

  it("continues company sync after one company fails", async () => {
    const harness = createTestHarness({
      manifest,
      config: { opskeeperBaseUrl: "not-a-url" }
    });
    const companies = vi.fn(async () => [
      { id: "company-1" },
      { id: "company-2" }
    ] as Awaited<ReturnType<typeof harness.ctx.companies.list>>);
    vi.spyOn(harness.ctx.companies, "list").mockImplementation(companies);

    await plugin.definition.setup(harness.ctx);
    await harness.runJob(JOB_KEY);

    expect(companies).toHaveBeenCalledTimes(1);
    expect(harness.logs.filter((entry) => entry.message === "OpsKeeper company sync failed")).toHaveLength(2);
  });
});
