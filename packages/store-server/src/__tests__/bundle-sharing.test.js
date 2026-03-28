import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createApp } from "../index.js";
import { resetDatabase } from "../db/database.js";

describe("Multi-client bundle sharing", () => {
  let server;
  let baseUrl;
  let tmpDir;

  beforeAll(async () => {
    // Set up isolated temp directory for this test run
    tmpDir = join(tmpdir(), `bim-store-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    mkdirSync(join(tmpDir, "packages"), { recursive: true });
    mkdirSync(join(tmpDir, "tmp"), { recursive: true });
    process.env.STORE_DATA_DIR = tmpDir;

    const app = createApp();

    // Start server on random port
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    resetDatabase();
    delete process.env.STORE_DATA_DIR;
    // Clean up temp directory
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it("Client B can discover, inspect, and download a bundle published by Client A", async () => {
    const bundleCode = 'export function activate(ctx) { ctx.doc.add({ id: crypto.randomUUID(), kind: "testBeam" }); }\nexport function deactivate() {}';

    const manifestA = {
      id: "test.shared-columns",
      name: "Shared Column Grid",
      version: "1.0.0",
      description: "Creates a parametric grid of columns for structural layouts",
      author: "Client A",
      main: "bundle.js",
      readme: "# Shared Column Grid\n\nGenerates a configurable grid of structural columns.\n\n## Usage\n\nInstall and activate to place a 3x3 column grid.",
      contributes: {
        elements: [{ kind: "testBeam", entrypoint: "bundle.js" }],
        wiki: [
          { path: "test.shared-columns/overview", category: "features", title: "Shared Column Grid" },
        ],
      },
    };

    // ── CLIENT A: Publish extension ──────────────────────────────────
    const form = new FormData();
    form.append("manifest", JSON.stringify(manifestA));
    form.append(
      "bundle",
      new Blob([bundleCode], { type: "application/javascript" }),
      "bundle.js"
    );

    const publishRes = await fetch(`${baseUrl}/api/extensions`, {
      method: "POST",
      body: form,
    });
    expect(publishRes.ok).toBe(true);

    const publishData = await publishRes.json();
    expect(publishData.id).toBe("test.shared-columns");
    expect(publishData.version).toBe("1.0.0");

    // ── CLIENT B: Discover extension via listing ─────────────────────
    const listRes = await fetch(`${baseUrl}/api/extensions`);
    expect(listRes.ok).toBe(true);

    const extensions = await listRes.json();
    const found = extensions.find((e) => e.id === "test.shared-columns");
    expect(found).toBeDefined();
    expect(found.name).toBe("Shared Column Grid");
    expect(found.author).toBe("Client A");

    // ── CLIENT B: Get full details including readme ──────────────────
    const detailRes = await fetch(`${baseUrl}/api/extensions/test.shared-columns`);
    expect(detailRes.ok).toBe(true);

    const detail = await detailRes.json();
    expect(detail.readme).toBe(manifestA.readme);
    expect(detail.description).toBe("Creates a parametric grid of columns for structural layouts");
    expect(detail.bundle_hash).toBeTruthy();
    expect(detail.contributions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "element", key: "testBeam" }),
        expect.objectContaining({ type: "wiki", key: "test.shared-columns/overview", label: "Shared Column Grid", category: "features" }),
      ])
    );

    const bundleHash = detail.bundle_hash;

    // ── CLIENT B: Download the bundle ────────────────────────────────
    const downloadRes = await fetch(`${baseUrl}/api/extensions/test.shared-columns/download`);
    expect(downloadRes.ok).toBe(true);
    expect(downloadRes.headers.get("content-type")).toContain("application/javascript");

    const downloadedCode = await downloadRes.text();
    expect(downloadedCode).toBe(bundleCode);

    // ── Verify download count incremented ────────────────────────────
    const detailAfter = await fetch(`${baseUrl}/api/extensions/test.shared-columns`);
    const afterData = await detailAfter.json();
    expect(afterData.downloads).toBe(1);

    // ── CLIENT B (second instance): Also downloads same bundle ───────
    const download2Res = await fetch(`${baseUrl}/api/extensions/test.shared-columns/download`);
    expect(download2Res.ok).toBe(true);
    expect(download2Res.headers.get("content-type")).toContain("application/javascript");

    const downloaded2 = await download2Res.text();
    expect(downloaded2).toBe(bundleCode);

    // Verify download count is now 2
    const detailFinal = await fetch(`${baseUrl}/api/extensions/test.shared-columns`);
    const finalData = await detailFinal.json();
    expect(finalData.downloads).toBe(2);

    // Bundle hash remains consistent
    expect(finalData.bundle_hash).toBe(bundleHash);
  });

  it("Client A updates the bundle and Client B gets the new version", async () => {
    const updatedCode = 'export function activate(ctx) { ctx.doc.add({ id: crypto.randomUUID(), kind: "testBeam", width: 0.5 }); }\nexport function deactivate() {}';

    const manifestV2 = {
      id: "test.shared-columns",
      name: "Shared Column Grid",
      version: "2.0.0",
      description: "Creates a parametric grid of columns — now with configurable width",
      author: "Client A",
      main: "bundle.js",
      readme: "# Shared Column Grid v2\n\nNow supports configurable column width.",
      contributes: {
        elements: [{ kind: "testBeam", entrypoint: "bundle.js" }],
        wiki: [
          { path: "test.shared-columns/overview", category: "features", title: "Shared Column Grid v2" },
        ],
      },
    };

    // CLIENT A: Publish updated version
    const form = new FormData();
    form.append("manifest", JSON.stringify(manifestV2));
    form.append(
      "bundle",
      new Blob([updatedCode], { type: "application/javascript" }),
      "bundle.js"
    );

    const pubRes = await fetch(`${baseUrl}/api/extensions`, {
      method: "POST",
      body: form,
    });
    expect(pubRes.ok).toBe(true);

    // CLIENT B: Gets updated details including wiki
    const detailRes = await fetch(`${baseUrl}/api/extensions/test.shared-columns`);
    const detail = await detailRes.json();
    expect(detail.version).toBe("2.0.0");
    expect(detail.readme).toBe("# Shared Column Grid v2\n\nNow supports configurable column width.");
    expect(detail.contributions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "wiki", label: "Shared Column Grid v2" }),
      ])
    );

    // CLIENT B: Downloads updated bundle
    const dlRes = await fetch(`${baseUrl}/api/extensions/test.shared-columns/download`);
    const dlCode = await dlRes.text();
    expect(dlCode).toBe(updatedCode);
  });
});
