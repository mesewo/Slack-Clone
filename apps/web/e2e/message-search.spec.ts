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
  console.log("[checkpoint] startRealBackend returned");
  try {
    const user = await registerUser(
      `search-${Date.now()}@example.test`,
      "Search User",
    );
    console.log("[checkpoint] registerUser returned");
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
    const searchResponses: Array<{ status: number; body: string }> = [];
    page.on("response", (response) => {
      if (!response.url().includes("/api/search/messages")) return;
      void response
        .text()
        .then((body) =>
          searchResponses.push({ status: response.status(), body }),
        )
        .catch(() => undefined);
    });
    try {
      await signIn(page, user.email);
      console.log("[checkpoint] signIn returned");
      await page.goto(
        `http://localhost:3000/home/${workspace.body.id}/channels/${channel.body.id}`,
      );
      console.log("[checkpoint] page.goto returned");
      const search = page.getByRole("searchbox", {
        name: /Search messages in/i,
      });
      const result = page.locator(
        `[data-testid="search-result-${message.body.id}"]`,
      );
      const messageCreatedAt = Date.now();
      console.log("[checkpoint] right before ES-indexing loop");
      let indexedAt: number | undefined;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const elasticsearchResponse = await fetch(
          `http://127.0.0.1:9200/messages/_doc/${message.body.id}`,
        );
        if (elasticsearchResponse.status === 200) {
          indexedAt = Date.now();
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      console.log(
        `[search timing] message created -> Elasticsearch indexed: ${indexedAt ? `${indexedAt - messageCreatedAt}ms` : "not indexed within 15s"}`,
      );

      await search.fill(content);
      await expect(result).toBeVisible({ timeout: 15_000 });
      await expect(result).toContainText(content);
      await expect(result).toContainText("Search User");
      await expect(result).toContainText(`# ${channel.body.name}`);
      await expect(result).toContainText("/");
      await result.click();
      await expect(
        page.locator(`[data-message-id="${message.body.id}"]`),
      ).toBeVisible();
      console.log(`[search responses] ${JSON.stringify(searchResponses)}`);
    } finally {
      console.log(`[search responses] ${JSON.stringify(searchResponses)}`);
      await context.close();
    }
  } finally {
    stopBackendProcesses();
  }
});
