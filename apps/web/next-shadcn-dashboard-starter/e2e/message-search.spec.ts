import { test, expect } from "@playwright/test";
import {
  apiRequest,
  registerUser,
  signIn,
  startRealBackend,
  stopBackendProcesses,
} from "./support/real-services";

test("searches real channel messages and opens the matching result", async ({
  browser,
}) => {
  test.slow();
  await startRealBackend();
  try {
    const user = await registerUser(
      `search-${Date.now()}@example.test`,
      "Search User",
    );
    const workspace = await apiRequest("POST", "/api/workspaces", user.cookie, {
      name: `Search Workspace ${Date.now()}`,
    });
    expect(workspace.status).toBe(201);
    const channel = await apiRequest("POST", "/api/channels", user.cookie, {
      workspace_id: workspace.body.id,
      name: `search-${Date.now()}`,
      type: "PUBLIC",
    });
    expect(channel.status).toBe(201);
    const content = `search-proof-${Date.now()}`;
    const message = await apiRequest(
      "POST",
      `/api/channels/${channel.body.id}/messages`,
      user.cookie,
      { content },
    );
    expect(message.status).toBe(201);

    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await signIn(page, user.email);
      await page.goto(
        `http://localhost:3000/home/${workspace.body.id}/channels/${channel.body.id}`,
      );
      const search = page.getByRole("searchbox", {
        name: /Search messages in/i,
      });
      await search.fill(content);
      const result = page.locator(
        `[data-testid="search-result-${message.body.id}"]`,
      );
      await expect(result).toContainText(content);
      await expect(result).toContainText("Search User");
      await expect(result).toContainText(`# ${channel.body.name}`);
      await expect(result).toContainText("/");
      await result.click();
      await expect(
        page.locator(`[data-message-id="${message.body.id}"]`),
      ).toBeVisible();
    } finally {
      await context.close();
    }
  } finally {
    stopBackendProcesses();
  }
});
