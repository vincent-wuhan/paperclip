import { mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  BUNDLED_PLUGIN_CATALOG,
  DESKTOP_AUTO_INSTALL_KEYS_ENV_VAR,
  SELF_HOSTED_AUTO_INSTALL_KEYS,
  resolveBundledPluginInstalls,
  resolveSelfHostedAutoInstallKeys,
} from "../services/bundled-plugins.js";
import {
  distributionBundleDigest,
  readDistributionPluginCatalog,
} from "../services/distribution-plugin-catalog.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

/** A bundled root with one desktop-style distribution bundle under `distribution/`. */
function desktopFixture() {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "desktop-auto-install-")));
  roots.push(root);
  const localPath = path.join(root, "distribution", "benyue.vertical");
  mkdirSync(path.join(localPath, "dist", "ui"), { recursive: true });
  writeFileSync(path.join(localPath, "package.json"), JSON.stringify({
    name: "@benyue/vertical", version: "1.2.3",
    paperclipPlugin: { manifest: "./dist/manifest.js", worker: "./dist/worker.js", ui: "./dist/ui/" },
  }));
  writeFileSync(path.join(localPath, "dist", "manifest.js"), "export default {};");
  writeFileSync(path.join(localPath, "dist", "worker.js"), "export default {};");
  const entry = { key: "benyue.vertical", pluginKey: "benyue.vertical", version: "1.2.3", directory: "benyue.vertical", digest: distributionBundleDigest(localPath) };
  writeFileSync(path.join(root, "distribution", "catalog.json"), JSON.stringify({ schemaVersion: 1, plugins: [entry] }));
  return { root, localPath, entry };
}

describe("desktop auto-install keys", () => {
  it("keeps the legacy self-hosted list when the env var is unset or blank", () => {
    expect(resolveSelfHostedAutoInstallKeys({})).toBe(SELF_HOSTED_AUTO_INSTALL_KEYS);
    expect(resolveSelfHostedAutoInstallKeys({ [DESKTOP_AUTO_INSTALL_KEYS_ENV_VAR]: "" })).toBe(SELF_HOSTED_AUTO_INSTALL_KEYS);
    expect(resolveSelfHostedAutoInstallKeys({ [DESKTOP_AUTO_INSTALL_KEYS_ENV_VAR]: "   " })).toBe(SELF_HOSTED_AUTO_INSTALL_KEYS);
  });

  it("appends desktop keys after the built-ins, trimming and deduplicating", () => {
    expect(resolveSelfHostedAutoInstallKeys({ [DESKTOP_AUTO_INSTALL_KEYS_ENV_VAR]: " benyue.a , kubernetes ,benyue.b," }))
      .toEqual(["kubernetes", "benyue.a", "benyue.b"]);
  });

  it("resolves desktop keys through the distribution catalog with enforceCatalogRoot off", () => {
    const { root, localPath } = desktopFixture();
    const distributionPlugins = readDistributionPluginCatalog(root, BUNDLED_PLUGIN_CATALOG);
    const installs = resolveBundledPluginInstalls(
      resolveSelfHostedAutoInstallKeys({ [DESKTOP_AUTO_INSTALL_KEYS_ENV_VAR]: "benyue.vertical" }),
      { catalogRoot: root, env: {}, enforceCatalogRoot: false, distributionPlugins },
    );
    expect(installs.map(({ key }) => key)).toEqual(["kubernetes", "benyue.vertical"]);
    expect(installs[1]).toMatchObject({ pluginKey: "benyue.vertical", localPath, distribution: expect.objectContaining({ version: "1.2.3" }) });
  });

  it("still refuses desktop keys absent from both catalogs", () => {
    const { root } = desktopFixture();
    const distributionPlugins = readDistributionPluginCatalog(root, BUNDLED_PLUGIN_CATALOG);
    expect(() => resolveBundledPluginInstalls(
      resolveSelfHostedAutoInstallKeys({ [DESKTOP_AUTO_INSTALL_KEYS_ENV_VAR]: "benyue.missing" }),
      { catalogRoot: root, env: {}, enforceCatalogRoot: false, distributionPlugins },
    )).toThrow(/not in the bundled catalog/);
  });

  it("rejects a desktop bundle whose digest no longer matches the catalog", () => {
    const { root, localPath } = desktopFixture();
    writeFileSync(path.join(localPath, "dist", "worker.js"), "export default 'tampered';");
    expect(() => readDistributionPluginCatalog(root, BUNDLED_PLUGIN_CATALOG)).toThrow(/digest mismatch/);
  });
});
