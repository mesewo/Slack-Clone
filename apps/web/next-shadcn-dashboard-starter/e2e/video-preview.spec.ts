import { test, expect } from "@playwright/test";
import {
  apiRequest,
  registerUser,
  signIn,
  startRealBackend,
  stopBackendProcesses,
} from "./support/real-services";

test("renders an uploaded video inline and keeps download available", async ({
  browser,
}) => {
  test.slow();
  await startRealBackend();
  try {
    const user = await registerUser(
      `video-${Date.now()}@example.test`,
      "Video User",
    );
    const workspace = await apiRequest("POST", "/api/workspaces", user.cookie, {
      name: `Video Workspace ${Date.now()}`,
    });
    expect(workspace.status).toBe(201);
    const channel = await apiRequest("POST", "/api/channels", user.cookie, {
      workspace_id: workspace.body.id,
      name: `video-${Date.now()}`,
      type: "PUBLIC",
    });
    expect(channel.status).toBe(201);

    const presign = await apiRequest(
      "POST",
      "/api/uploads/presign",
      user.cookie,
      {
        filename: "proof.mp4",
        content_type: "video/mp4",
        size_bytes: 16,
      },
    );
    expect(presign.status).toBe(200);
    const put = await fetch(presign.body.upload_url, {
      method: "PUT",
      headers: { "Content-Type": "video/mp4" },
      body: new Uint8Array(16),
    });
    expect(put.ok).toBeTruthy();
    const complete = await apiRequest(
      "POST",
      "/api/uploads/complete",
      user.cookie,
      {
        session_id: presign.body.session_id,
      },
    );
    expect(complete.status).toBe(200);
    const message = await apiRequest(
      "POST",
      `/api/channels/${channel.body.id}/messages`,
      user.cookie,
      { content: "inline video proof", attachment_ids: [complete.body.id] },
    );
    expect(message.status).toBe(201);

    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await signIn(page, user.email);
      await page.goto(
        `http://localhost:3000/home/${workspace.body.id}/channels/${channel.body.id}`,
      );
      await expect(
        page.locator(`[data-testid="inline-video-${complete.body.id}"]`),
      ).toHaveAttribute("controls", "");
      await expect(
        page.getByRole("button", { name: "Download proof.mp4" }),
      ).toBeVisible();
    } finally {
      await context.close();
    }
  } finally {
    stopBackendProcesses();
  }
});
