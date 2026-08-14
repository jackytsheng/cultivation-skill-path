import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);
const previewComponent = new URL(
  "../app/_sites-preview/SkeletonPreview.tsx",
  import.meta.url,
);
const previewStyles = new URL("../app/_sites-preview/preview.css", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the cultivation growth app", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>修炼档案<\/title>/i);
  assert.match(html, /架子鼓/);
  assert.match(html, /当前境界/);
  assert.match(html, /AI JSON/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("removes disposable starter preview files", async () => {
  await assert.rejects(access(previewComponent));
  await assert.rejects(access(previewStyles));
  await assert.rejects(
    access(new URL("public/_sites-preview", templateRoot)),
  );
});
