# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: message-search.spec.ts >> searches real channel messages and opens the matching result
- Location: e2e\message-search.spec.ts:10:5

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 0
Received:   0

Call Log:
- Timeout 20000ms exceeded while waiting on the predicate
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
  15  |   try {
  16  |     const user = await registerUser(
  17  |       `search-${Date.now()}@example.test`,
  18  |       "Search User",
  19  |     );
  20  |     const workspace = await apiRequest("POST", "/api/workspaces", user.cookie, {
  21  |       name: `Search Workspace ${Date.now()}`,
  22  |     });
  23  |     expect(workspace.status).toBe(201);
  24  |     const channel = await apiRequest("POST", "/api/channels", user.cookie, {
  25  |       workspace_id: workspace.body.id,
  26  |       name: `search-${Date.now()}`,
  27  |       type: "PUBLIC",
  28  |     });
  29  |     expect(channel.status).toBe(201);
  30  |     const content = `search-proof-${Date.now()}`;
  31  |     const message = await apiRequest(
  32  |       "POST",
  33  |       `/api/channels/${channel.body.id}/messages`,
  34  |       user.cookie,
  35  |       { content },
  36  |     );
  37  |     expect(message.status).toBe(201);
  38  | 
  39  |     const context = await browser.newContext();
  40  |     const page = await context.newPage();
  41  |     const searchResponses: Array<{ status: number; body: string }> = [];
  42  |     page.on("response", (response) => {
  43  |       if (!response.url().includes("/api/search/messages")) return;
  44  |       void response
  45  |         .text()
  46  |         .then((body) =>
  47  |           searchResponses.push({ status: response.status(), body }),
  48  |         )
  49  |         .catch(() => undefined);
  50  |     });
  51  |     try {
  52  |       await signIn(page, user.email);
  53  |       await page.goto(
  54  |         `http://localhost:3000/home/${workspace.body.id}/channels/${channel.body.id}`,
  55  |       );
  56  |       const search = page.getByRole("searchbox", {
  57  |         name: /Search messages in/i,
  58  |       });
  59  |       const result = page.locator(
  60  |         `[data-testid="search-result-${message.body.id}"]`,
  61  |       );
  62  |       const messageCreatedAt = Date.now();
  63  |       let indexedAt: number | undefined;
  64  |       for (let attempt = 0; attempt < 30; attempt += 1) {
  65  |         const elasticsearchResponse = await fetch(
  66  |           `http://127.0.0.1:9200/messages/_doc/${message.body.id}`,
  67  |         );
  68  |         if (elasticsearchResponse.status === 200) {
  69  |           indexedAt = Date.now();
  70  |           break;
  71  |         }
  72  |         await new Promise((resolve) => setTimeout(resolve, 500));
  73  |       }
  74  |       console.log(
  75  |         `[search timing] message created -> Elasticsearch indexed: ${indexedAt ? `${indexedAt - messageCreatedAt}ms` : "not indexed within 15s"}`,
  76  |       );
  77  | 
  78  |       await expect
  79  |         .poll(
  80  |           async () => {
  81  |             await search.fill("");
  82  |             await search.fill(content);
  83  |             return await result.count();
  84  |           },
  85  |           { timeout: 20_000, intervals: [1_000] },
  86  |         )
> 87  |         .toBeGreaterThan(0);
      |          ^ Error: expect(received).toBeGreaterThan(expected)
  88  |       await expect(result).toContainText(content);
  89  |       await expect(result).toContainText("Search User");
  90  |       await expect(result).toContainText(`# ${channel.body.name}`);
  91  |       await expect(result).toContainText("/");
  92  |       await result.click();
  93  |       await expect(
  94  |         page.locator(`[data-message-id="${message.body.id}"]`),
  95  |       ).toBeVisible();
  96  |       console.log(`[search responses] ${JSON.stringify(searchResponses)}`);
  97  |     } finally {
  98  |       console.log(`[search responses] ${JSON.stringify(searchResponses)}`);
  99  |       await context.close();
  100 |     }
  101 |   } finally {
  102 |     stopBackendProcesses();
  103 |   }
  104 | });
  105 | 
```