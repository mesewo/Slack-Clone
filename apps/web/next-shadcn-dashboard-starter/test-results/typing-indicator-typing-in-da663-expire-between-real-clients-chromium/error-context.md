# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: typing-indicator.spec.ts >> typing indicators broadcast and expire between real clients
- Location: e2e\typing-indicator.spec.ts:22:5

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
  22  | test("typing indicators broadcast and expire between real clients", async ({
  23  |   browser,
  24  | }) => {
  25  |   test.slow();
  26  |   await startRealBackend();
  27  |   console.log("[typing checkpoint] startRealBackend returned");
  28  |   try {
  29  |     const userA = await registerUser(
  30  |       `typing-a-${Date.now()}@example.test`,
  31  |       "Typing Alpha",
  32  |     );
  33  |     const userB = await registerUser(
  34  |       `typing-b-${Date.now()}@example.test`,
  35  |       "Typing Beta",
  36  |     );
  37  |     console.log("[typing checkpoint] users registered");
  38  | 
  39  |     const workspace = await apiRequest(
  40  |       "POST",
  41  |       "/api/workspaces",
  42  |       userA.cookie,
  43  |       {
  44  |         name: `Typing Workspace ${Date.now()}`,
  45  |       },
  46  |     );
  47  |     expect(workspace.status).toBe(201);
  48  |     expect(
  49  |       (
  50  |         await apiRequest("POST", "/api/workspaces/join", userB.cookie, {
  51  |           slug: workspace.body.slug,
  52  |         })
  53  |       ).status,
  54  |     ).toBe(200);
  55  |     const channel = await apiRequest("POST", "/api/channels", userA.cookie, {
  56  |       workspace_id: workspace.body.id,
  57  |       name: `typing-${Date.now()}`,
  58  |       type: "PUBLIC",
  59  |     });
  60  |     expect(channel.status).toBe(201);
  61  |     await joinChannel(userA.cookie, channel.body.id);
  62  |     await joinChannel(userB.cookie, channel.body.id);
  63  |     console.log("[typing checkpoint] workspace and channel ready");
  64  | 
  65  |     const contextA = await browser.newContext();
  66  |     const contextB = await browser.newContext();
  67  |     const pageA = await contextA.newPage();
  68  |     const pageB = await contextB.newPage();
  69  |     try {
  70  |       await signIn(pageA, userA.email);
  71  |       await signIn(pageB, userB.email);
  72  |       console.log("[typing checkpoint] both users signed in");
  73  |       const channelUrl = `http://localhost:3000/home/${workspace.body.id}/channels/${channel.body.id}`;
  74  |       await pageA.goto(channelUrl);
  75  |       await pageB.goto(channelUrl);
  76  |       console.log("[typing checkpoint] both channel pages loaded");
  77  | 
  78  |       const composerA = pageA.getByRole("textbox", {
  79  |         name: /Message #/i,
  80  |       });
  81  |       const typingIndicatorB = pageB.getByText("Someone is typing...", {
  82  |         exact: true,
  83  |       });
> 84  |       await composerA.pressSequentially("hello", { delay: 50 });
      |                       ^ Error: locator.pressSequentially: Page crashed
  85  |       console.log("[typing checkpoint] user A started typing");
  86  |       await expect(typingIndicatorB).toBeVisible({ timeout: 10_000 });
  87  |       console.log("[typing checkpoint] user B saw typing indicator");
  88  | 
  89  |       await composerA.press("Enter");
  90  |       await expect(typingIndicatorB).toBeHidden({ timeout: 6_000 });
  91  |       console.log("[typing checkpoint] indicator cleared after send");
  92  | 
  93  |       await composerA.pressSequentially("idle", { delay: 50 });
  94  |       console.log("[typing checkpoint] user A started idle typing");
  95  |       await expect(typingIndicatorB).toBeVisible({ timeout: 10_000 });
  96  |       await expect(typingIndicatorB).toBeHidden({ timeout: 6_000 });
  97  |       console.log(
  98  |         "[typing checkpoint] indicator cleared after the 3-second idle timeout",
  99  |       );
  100 |     } finally {
  101 |       await contextA.close();
  102 |       await contextB.close();
  103 |     }
  104 |   } finally {
  105 |     stopBackendProcesses();
  106 |   }
  107 | });
  108 | 
```