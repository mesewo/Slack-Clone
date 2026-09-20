# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: thread-persistence.spec.ts >> thread replies persist and update the parent in real time
- Location: e2e\thread-persistence.spec.ts:22:5

# Error details

```
Error: locator.pressSequentially: Page crashed
Call log:
  - waiting for getByRole('textbox', { name: /Message #/i })

```

# Test source

```ts
  1   | import { test, expect } from "@playwright/test";
  2   | import {
  3   |   apiRequest,
  4   |   registerUser,
  5   |   signIn,
  6   |   startRealBackend,
  7   |   stopBackendProcesses,
  8   | } from "./support/real-services";
  9   | 
  10  | async function joinChannel(cookie: string, channelId: string) {
  11  |   const response = await fetch(
  12  |     `http://localhost:8080/api/channels/${channelId}/join`,
  13  |     {
  14  |       method: "POST",
  15  |       headers: { "Content-Type": "application/json", Cookie: cookie },
  16  |       body: "{}",
  17  |     },
  18  |   );
  19  |   expect([200, 201, 204, 409]).toContain(response.status);
  20  | }
  21  | 
  22  | test("thread replies persist and update the parent in real time", async ({
  23  |   browser,
  24  | }) => {
  25  |   test.slow();
  26  |   await startRealBackend();
  27  |   console.log("[thread checkpoint] startRealBackend returned");
  28  |   try {
  29  |     const userA = await registerUser(
  30  |       `thread-a-${Date.now()}@example.test`,
  31  |       "Thread Alpha",
  32  |     );
  33  |     const userB = await registerUser(
  34  |       `thread-b-${Date.now()}@example.test`,
  35  |       "Thread Beta",
  36  |     );
  37  |     console.log("[thread checkpoint] users registered");
  38  |     const workspace = await apiRequest(
  39  |       "POST",
  40  |       "/api/workspaces",
  41  |       userA.cookie,
  42  |       { name: `Thread Workspace ${Date.now()}` },
  43  |     );
  44  |     expect(workspace.status).toBe(201);
  45  |     expect(
  46  |       (
  47  |         await apiRequest("POST", "/api/workspaces/join", userB.cookie, {
  48  |           slug: workspace.body.slug,
  49  |         })
  50  |       ).status,
  51  |     ).toBe(200);
  52  |     const channel = await apiRequest("POST", "/api/channels", userA.cookie, {
  53  |       workspace_id: workspace.body.id,
  54  |       name: `thread-${Date.now()}`,
  55  |       type: "PUBLIC",
  56  |     });
  57  |     expect(channel.status).toBe(201);
  58  |     await joinChannel(userA.cookie, channel.body.id);
  59  |     await joinChannel(userB.cookie, channel.body.id);
  60  |     console.log("[thread checkpoint] workspace and channel ready");
  61  | 
  62  |     const contextA = await browser.newContext();
  63  |     const contextB = await browser.newContext();
  64  |     const pageA = await contextA.newPage();
  65  |     const pageB = await contextB.newPage();
  66  |     try {
  67  |       await signIn(pageA, userA.email);
  68  |       await signIn(pageB, userB.email);
  69  |       console.log("[thread checkpoint] both users signed in");
  70  |       const channelUrl = `http://localhost:3000/home/${workspace.body.id}/channels/${channel.body.id}`;
  71  |       await pageA.goto(channelUrl);
  72  |       await pageB.goto(channelUrl);
  73  |       console.log("[thread checkpoint] both channel pages loaded");
  74  | 
  75  |       const parentText = `thread-parent-${Date.now()}`;
  76  |       const replyText = `thread-reply-${Date.now()}`;
  77  |       const composerA = pageA.getByRole("textbox", { name: /Message #/i });
> 78  |       await composerA.pressSequentially(parentText, { delay: 25 });
      |                       ^ Error: locator.pressSequentially: Page crashed
  79  |       await composerA.press("Enter");
  80  |       console.log("[thread checkpoint] user A sent parent message");
  81  |       await expect
  82  |         .poll(
  83  |           async () => {
  84  |             const messages = await apiRequest(
  85  |               "GET",
  86  |               `/api/channels/${channel.body.id}/messages`,
  87  |               userA.cookie,
  88  |             );
  89  |             return Array.isArray(messages.body)
  90  |               ? messages.body.some(
  91  |                   (message: { content?: string }) =>
  92  |                     message.content === parentText,
  93  |                 )
  94  |               : false;
  95  |           },
  96  |           { timeout: 15_000, intervals: [500] },
  97  |         )
  98  |         .toBe(true);
  99  |       console.log(
  100 |         "[thread checkpoint] parent confirmed in persisted REST history",
  101 |       );
  102 |       await pageA.goto(channelUrl);
  103 |       await expect(pageA).toHaveURL(channelUrl);
  104 |       await pageA.reload();
  105 |       await expect(pageA).toHaveURL(channelUrl);
  106 |       await expect(
  107 |         pageA.getByRole("textbox", { name: /Message #/i }),
  108 |       ).toBeVisible({ timeout: 15_000 });
  109 |       await pageB.reload();
  110 |       await expect(pageB).toHaveURL(channelUrl);
  111 |       await pageB.goto(channelUrl);
  112 |       await expect(
  113 |         pageB.getByRole("textbox", { name: /Message #/i }),
  114 |       ).toBeVisible({ timeout: 15_000 });
  115 |       console.log(
  116 |         "[thread checkpoint] user B reloaded persisted parent history",
  117 |       );
  118 | 
  119 |       const parentA = pageA
  120 |         .locator("[data-message-id]")
  121 |         .filter({ hasText: parentText });
  122 |       const parentB = pageB
  123 |         .locator("[data-message-id]")
  124 |         .filter({ hasText: parentText });
  125 |       await expect(parentB).toBeVisible({ timeout: 15_000 });
  126 |       console.log("[thread checkpoint] B parent rendered");
  127 |       await expect(parentA).toBeVisible({ timeout: 15_000 });
  128 |       console.log("[thread checkpoint] A parent rendered");
  129 | 
  130 |       await parentA.hover();
  131 |       const replyButtonA = parentA.locator(
  132 |         'button[aria-label="Reply in thread"]',
  133 |       );
  134 |       await expect(replyButtonA).toBeVisible({ timeout: 5_000 });
  135 |       await replyButtonA.click();
  136 |       await expect(
  137 |         pageA.getByRole("heading", { name: "Thread" }),
  138 |       ).toBeVisible();
  139 |       console.log("[thread checkpoint] A thread panel opened");
  140 |       await parentB.hover();
  141 |       const replyButtonB = parentB.locator(
  142 |         'button[aria-label="Reply in thread"]',
  143 |       );
  144 |       await expect(replyButtonB).toBeVisible({ timeout: 5_000 });
  145 |       await replyButtonB.click();
  146 |       const replyBoxB = pageB.getByPlaceholder("Reply in thread...");
  147 |       await expect(replyBoxB).toBeVisible({ timeout: 5_000 });
  148 |       console.log("[thread checkpoint] B thread panel opened");
  149 |       await replyBoxB.fill(replyText);
  150 |       console.log("[thread checkpoint] B filled reply composer");
  151 |       const replyResponsePromise = pageB.waitForResponse(
  152 |         (response) =>
  153 |           response.url().includes(`/messages/`) &&
  154 |           response.url().endsWith("/replies") &&
  155 |           response.request().method() === "POST",
  156 |       );
  157 |       await pageB.getByRole("button", { name: "Send Reply" }).click();
  158 |       console.log("[thread checkpoint] B clicked Send Reply");
  159 |       const replyResponse = await replyResponsePromise;
  160 |       console.log(`[thread HTTP response] ${await replyResponse.text()}`);
  161 |       console.log("[thread checkpoint] user B sent thread reply through UI");
  162 | 
  163 |       const threadPanelA = pageA
  164 |         .getByRole("complementary")
  165 |         .filter({ has: pageA.getByRole("heading", { name: "Thread" }) });
  166 |       await expect(threadPanelA).toContainText(replyText, { timeout: 15_000 });
  167 |       await expect(
  168 |         threadPanelA.getByText("1 replies", { exact: true }),
  169 |       ).toBeVisible({ timeout: 15_000 });
  170 |       await expect(parentA).not.toHaveText(replyText);
  171 |       console.log(
  172 |         "[thread checkpoint] user A saw real-time reply and parent count",
  173 |       );
  174 | 
  175 |       await pageA.reload();
  176 |       await expect(pageA).toHaveURL(channelUrl);
  177 |       const parentAfterReload = pageA
  178 |         .locator("[data-message-id]")
```