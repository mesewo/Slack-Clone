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

test("typing indicators broadcast and expire between real clients", async ({
  browser,
}) => {
  test.slow();
  await startRealBackend();
  console.log("[typing checkpoint] startRealBackend returned");
  try {
    const userA = await registerUser(
      `typing-a-${Date.now()}@example.test`,
      "Typing Alpha",
    );
    const userB = await registerUser(
      `typing-b-${Date.now()}@example.test`,
      "Typing Beta",
    );
    console.log("[typing checkpoint] users registered");

    const workspace = await apiRequest(
      "POST",
      "/api/workspaces",
      userA.cookie,
      {
        name: `Typing Workspace ${Date.now()}`,
      },
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
      name: `typing-${Date.now()}`,
      type: "PUBLIC",
    });
    expect(channel.status).toBe(201);
    await joinChannel(userA.cookie, channel.body.id);
    await joinChannel(userB.cookie, channel.body.id);
    console.log("[typing checkpoint] workspace and channel ready");

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    try {
      await signIn(pageA, userA.email);
      await signIn(pageB, userB.email);
      console.log("[typing checkpoint] both users signed in");
      const channelUrl = `http://localhost:3000/home/${workspace.body.id}/channels/${channel.body.id}`;
      await pageA.goto(channelUrl);
      await pageB.goto(channelUrl);
      console.log("[typing checkpoint] both channel pages loaded");

      const composerA = pageA.getByRole("textbox", {
        name: /Message #/i,
      });
      const typingIndicatorB = pageB.getByText("Someone is typing...", {
        exact: true,
      });
      await composerA.pressSequentially("hello", { delay: 50 });
      console.log("[typing checkpoint] user A started typing");
      await expect(typingIndicatorB).toBeVisible({ timeout: 10_000 });
      console.log("[typing checkpoint] user B saw typing indicator");

      await composerA.press("Enter");
      await expect(typingIndicatorB).toBeHidden({ timeout: 6_000 });
      console.log("[typing checkpoint] indicator cleared after send");

      await composerA.pressSequentially("idle", { delay: 50 });
      console.log("[typing checkpoint] user A started idle typing");
      await expect(typingIndicatorB).toBeVisible({ timeout: 10_000 });
      await expect(typingIndicatorB).toBeHidden({ timeout: 6_000 });
      console.log(
        "[typing checkpoint] indicator cleared after the 3-second idle timeout",
      );
    } finally {
      await contextA.close();
      await contextB.close();
    }
  } finally {
    stopBackendProcesses();
  }
});
