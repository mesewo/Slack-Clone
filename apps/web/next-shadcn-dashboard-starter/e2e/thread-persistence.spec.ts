import { test, expect } from "@playwright/test";
import {
  apiRequest,
  registerUser,
  signIn,
  startRealBackend,
  stopBackendProcesses,
} from "./support/real-services";

async function joinChannel(cookie: string, channelId: string) {
  const response = await fetch(
    `http://localhost:8080/api/channels/${channelId}/join`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: "{}",
    },
  );
  expect([200, 201, 204, 409]).toContain(response.status);
}

test("thread replies persist and update the parent in real time", async ({
  browser,
}) => {
  test.slow();
  await startRealBackend();
  console.log("[thread checkpoint] startRealBackend returned");
  try {
    const userA = await registerUser(
      `thread-a-${Date.now()}@example.test`,
      "Thread Alpha",
    );
    const userB = await registerUser(
      `thread-b-${Date.now()}@example.test`,
      "Thread Beta",
    );
    console.log("[thread checkpoint] users registered");
    const workspace = await apiRequest(
      "POST",
      "/api/workspaces",
      userA.cookie,
      { name: `Thread Workspace ${Date.now()}` },
    );
    expect(workspace.status).toBe(201);
    expect(
      (
        await apiRequest("POST", "/api/workspaces/join", userB.cookie, {
          slug: workspace.body.slug,
        })
      ).status,
    ).toBe(200);
    const channel = await apiRequest("POST", "/api/channels", userA.cookie, {
      workspace_id: workspace.body.id,
      name: `thread-${Date.now()}`,
      type: "PUBLIC",
    });
    expect(channel.status).toBe(201);
    await joinChannel(userA.cookie, channel.body.id);
    await joinChannel(userB.cookie, channel.body.id);
    console.log("[thread checkpoint] workspace and channel ready");

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    try {
      await signIn(pageA, userA.email);
      await signIn(pageB, userB.email);
      console.log("[thread checkpoint] both users signed in");
      const channelUrl = `http://localhost:3000/home/${workspace.body.id}/channels/${channel.body.id}`;
      await pageA.goto(channelUrl);
      await pageB.goto(channelUrl);
      console.log("[thread checkpoint] both channel pages loaded");

      const parentText = `thread-parent-${Date.now()}`;
      const replyText = `thread-reply-${Date.now()}`;
      const composerA = pageA.getByRole("textbox", { name: /Message #/i });
      await composerA.pressSequentially(parentText, { delay: 25 });
      await composerA.press("Enter");
      console.log("[thread checkpoint] user A sent parent message");
      await expect
        .poll(
          async () => {
            const messages = await apiRequest(
              "GET",
              `/api/channels/${channel.body.id}/messages`,
              userA.cookie,
            );
            return Array.isArray(messages.body)
              ? messages.body.some(
                  (message: { content?: string }) =>
                    message.content === parentText,
                )
              : false;
          },
          { timeout: 15_000, intervals: [500] },
        )
        .toBe(true);
      console.log(
        "[thread checkpoint] parent confirmed in persisted REST history",
      );
      await pageA.goto(channelUrl);
      await expect(pageA).toHaveURL(channelUrl);
      await pageA.reload();
      await expect(pageA).toHaveURL(channelUrl);
      await expect(
        pageA.getByRole("textbox", { name: /Message #/i }),
      ).toBeVisible({ timeout: 15_000 });
      await pageB.reload();
      await expect(pageB).toHaveURL(channelUrl);
      await pageB.goto(channelUrl);
      await expect(
        pageB.getByRole("textbox", { name: /Message #/i }),
      ).toBeVisible({ timeout: 15_000 });
      console.log(
        "[thread checkpoint] user B reloaded persisted parent history",
      );

      const parentA = pageA
        .locator("[data-message-id]")
        .filter({ hasText: parentText });
      const parentB = pageB
        .locator("[data-message-id]")
        .filter({ hasText: parentText });
      await expect(parentB).toBeVisible({ timeout: 15_000 });
      console.log("[thread checkpoint] B parent rendered");
      await expect(parentA).toBeVisible({ timeout: 15_000 });
      console.log("[thread checkpoint] A parent rendered");

      await parentA.hover();
      const replyButtonA = parentA.locator(
        'button[aria-label="Reply in thread"]',
      );
      await expect(replyButtonA).toBeVisible({ timeout: 5_000 });
      await replyButtonA.click();
      await expect(
        pageA.getByRole("heading", { name: "Thread" }),
      ).toBeVisible();
      console.log("[thread checkpoint] A thread panel opened");
      await parentB.hover();
      const replyButtonB = parentB.locator(
        'button[aria-label="Reply in thread"]',
      );
      await expect(replyButtonB).toBeVisible({ timeout: 5_000 });
      await replyButtonB.click();
      const replyBoxB = pageB.getByPlaceholder("Reply in thread...");
      await expect(replyBoxB).toBeVisible({ timeout: 5_000 });
      console.log("[thread checkpoint] B thread panel opened");
      await replyBoxB.fill(replyText);
      console.log("[thread checkpoint] B filled reply composer");
      const replyResponsePromise = pageB.waitForResponse(
        (response) =>
          response.url().includes(`/messages/`) &&
          response.url().endsWith("/replies") &&
          response.request().method() === "POST",
      );
      await pageB.getByRole("button", { name: "Send Reply" }).click();
      console.log("[thread checkpoint] B clicked Send Reply");
      const replyResponse = await replyResponsePromise;
      console.log(`[thread HTTP response] ${await replyResponse.text()}`);
      console.log("[thread checkpoint] user B sent thread reply through UI");

      const threadPanelA = pageA
        .getByRole("complementary")
        .filter({ has: pageA.getByRole("heading", { name: "Thread" }) });
      await expect(threadPanelA).toContainText(replyText, { timeout: 15_000 });
      await expect(
        threadPanelA.getByText("1 replies", { exact: true }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(parentA).not.toHaveText(replyText);
      console.log(
        "[thread checkpoint] user A saw real-time reply and parent count",
      );

      await pageA.reload();
      await expect(pageA).toHaveURL(channelUrl);
      const parentAfterReload = pageA
        .locator("[data-message-id]")
        .filter({ hasText: parentText });
      await expect(parentAfterReload).toBeVisible({ timeout: 15_000 });
      await parentAfterReload.hover();
      await expect(
        parentAfterReload.locator('button[aria-label="Reply in thread"]'),
      ).toBeVisible({ timeout: 5_000 });
      await parentAfterReload
        .locator('button[aria-label="Reply in thread"]')
        .first()
        .click();
      await expect(
        pageA
          .getByRole("complementary")
          .filter({ has: pageA.getByRole("heading", { name: "Thread" }) })
          .getByText("1 replies", { exact: true }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        pageA
          .getByRole("complementary")
          .filter({ has: pageA.getByRole("heading", { name: "Thread" }) }),
      ).toContainText(replyText, {
        timeout: 15_000,
      });
      console.log(
        "[thread checkpoint] reload preserved count and thread content",
      );
    } finally {
      await contextA.close();
      await contextB.close();
    }
  } finally {
    stopBackendProcesses();
  }
});
