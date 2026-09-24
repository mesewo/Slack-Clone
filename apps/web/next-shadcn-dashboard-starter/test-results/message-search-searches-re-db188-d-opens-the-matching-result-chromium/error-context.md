# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: message-search.spec.ts >> searches real channel messages and opens the matching result
- Location: e2e\message-search.spec.ts:10:5

# Error details

```
Error: locator.fill: Page crashed
Call log:
  - waiting for getByRole('searchbox', { name: /Search messages in/i })

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
  10  | test("searches real channel messages and opens the matching result", async ({
  11  |   browser,
  12  | }) => {
  13  |   test.slow();
  14  |   await startRealBackend();
  15  |   console.log("[checkpoint] startRealBackend returned");
  16  |   try {
  17  |     const user = await registerUser(
  18  |       `search-${Date.now()}@example.test`,
  19  |       "Search User",
  20  |     );
  21  |     console.log("[checkpoint] registerUser returned");
  22  |     const workspace = await apiRequest("POST", "/api/workspaces", user.cookie, {
  23  |       name: `Search Workspace ${Date.now()}`,
  24  |     });
  25  |     expect(workspace.status).toBe(201);
  26  |     const channel = await apiRequest("POST", "/api/channels", user.cookie, {
  27  |       workspace_id: workspace.body.id,
  28  |       name: `search-${Date.now()}`,
  29  |       type: "PUBLIC",
  30  |     });
  31  |     expect(channel.status).toBe(201);
  32  |     const content = `search-proof-${Date.now()}`;
  33  |     const message = await apiRequest(
  34  |       "POST",
  35  |       `/api/channels/${channel.body.id}/messages`,
  36  |       user.cookie,
  37  |       { content },
  38  |     );
  39  |     expect(message.status).toBe(201);
  40  | 
  41  |     const context = await browser.newContext();
  42  |     const page = await context.newPage();
  43  |     const searchResponses: Array<{ status: number; body: string }> = [];
  44  |     page.on("response", (response) => {
  45  |       if (!response.url().includes("/api/search/messages")) return;
  46  |       void response
  47  |         .text()
  48  |         .then((body) =>
  49  |           searchResponses.push({ status: response.status(), body }),
  50  |         )
  51  |         .catch(() => undefined);
  52  |     });
  53  |     try {
  54  |       await signIn(page, user.email);
  55  |       console.log("[checkpoint] signIn returned");
  56  |       await page.goto(
  57  |         `http://localhost:3000/home/${workspace.body.id}/channels/${channel.body.id}`,
  58  |       );
  59  |       console.log("[checkpoint] page.goto returned");
  60  |       const search = page.getByRole("searchbox", {
  61  |         name: /Search messages in/i,
  62  |       });
  63  |       const result = page.locator(
  64  |         `[data-testid="search-result-${message.body.id}"]`,
  65  |       );
  66  |       const messageCreatedAt = Date.now();
  67  |       console.log("[checkpoint] right before ES-indexing loop");
  68  |       let indexedAt: number | undefined;
  69  |       for (let attempt = 0; attempt < 30; attempt += 1) {
  70  |         const elasticsearchResponse = await fetch(
  71  |           `http://127.0.0.1:9200/messages/_doc/${message.body.id}`,
  72  |         );
  73  |         if (elasticsearchResponse.status === 200) {
  74  |           indexedAt = Date.now();
  75  |           break;
  76  |         }
  77  |         await new Promise((resolve) => setTimeout(resolve, 500));
  78  |       }
  79  |       console.log(
  80  |         `[search timing] message created -> Elasticsearch indexed: ${indexedAt ? `${indexedAt - messageCreatedAt}ms` : "not indexed within 15s"}`,
  81  |       );
  82  | 
> 83  |       await search.fill(content);
      |                    ^ Error: locator.fill: Page crashed
  84  |       await expect(result).toBeVisible({ timeout: 15_000 });
  85  |       await expect(result).toContainText(content);
  86  |       await expect(result).toContainText("Search User");
  87  |       await expect(result).toContainText(`# ${channel.body.name}`);
  88  |       await expect(result).toContainText("/");
  89  |       await result.click();
  90  |       await expect(
  91  |         page.locator(`[data-message-id="${message.body.id}"]`),
  92  |       ).toBeVisible();
  93  |       console.log(`[search responses] ${JSON.stringify(searchResponses)}`);
  94  |     } finally {
  95  |       console.log(`[search responses] ${JSON.stringify(searchResponses)}`);
  96  |       await context.close();
  97  |     }
  98  |   } finally {
  99  |     stopBackendProcesses();
  100 |   }
  101 | });
  102 | 
```