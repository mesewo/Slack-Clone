import assert from "node:assert/strict";
import test from "node:test";
import { MAX_UPLOAD_SIZE, performDirectUpload } from "./uploadFlow.mjs";

const file = { name: "photo.jpg", type: "image/jpeg", size: 6 * 1024 * 1024 };
const session = {
  session_id: "session-1", upload_url: "https://s3.us-east-005.backblazeb2.com/bucket/object?sig=secret",
  filename: file.name, content_type: file.type, size_bytes: file.size,
};

test("success uses presign, browser PUT, then completion exactly once", async () => {
  const calls = [];
  const result = await performDirectUpload(file, {
    presign: async (request) => { calls.push(["presign", request]); return session; },
    put: async (url, body, type) => { calls.push(["put", url, body, type]); return { ok: true, status: 200 }; },
    complete: async (id) => { calls.push(["complete", id]); return { id: "attachment-1" }; },
  });
  assert.deepEqual(result, { id: "attachment-1" });
  assert.deepEqual(calls.map(([stage]) => stage), ["presign", "put", "complete"]);
  assert.equal(calls[1][3], "image/jpeg");
});

test("failed PUT reports its stage and never completes or falls back", async () => {
  let completions = 0;
  let presigns = 0;
  await assert.rejects(performDirectUpload(file, {
    presign: async () => { presigns++; return session; },
    put: async () => { throw new TypeError("network error"); },
    complete: async () => { completions++; },
  }), /storage network request/);
  assert.equal(presigns, 1);
  assert.equal(completions, 0);
});

test("failed completion is reported without repeating PUT or completion", async () => {
  let puts = 0;
  let completions = 0;
  await assert.rejects(performDirectUpload(file, {
    presign: async () => session,
    put: async () => { puts++; return { ok: true, status: 200 }; },
    complete: async () => { completions++; throw { response: { status: 500 } }; },
  }), /completion/);
  assert.equal(puts, 1);
  assert.equal(completions, 1);
});

test("rejects files over 100 MiB before presigning", async () => {
  let presigns = 0;
  await assert.rejects(performDirectUpload({ ...file, size: MAX_UPLOAD_SIZE + 1 }, {
    presign: async () => { presigns++; return session; },
    put: async () => ({ ok: true, status: 200 }),
    complete: async () => ({}),
  }), /validation/);
  assert.equal(presigns, 0);
});
