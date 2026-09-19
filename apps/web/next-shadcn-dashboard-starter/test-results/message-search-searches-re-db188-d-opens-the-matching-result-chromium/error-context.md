# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: message-search.spec.ts >> searches real channel messages and opens the matching result
- Location: e2e\message-search.spec.ts:10:5

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('[data-testid="search-result-610c8caf-6c97-457e-9f7e-133a2ededad0"]')
Expected substring: "search-proof-1789845695657"
Timeout: 20000ms
Error: element(s) not found

Call log:
  - Expect "toContainText" locator('[data-testid="search-result-610c8caf-6c97-457e-9f7e-133a2ededad0"]') with timeout 20000ms
  - waiting for locator('[data-testid="search-result-610c8caf-6c97-457e-9f7e-133a2ededad0"]')

```

```yaml
- region "Notifications alt+T"
- link "Skip to content":
  - /url: "#main-content"
- list:
  - listitem:
    - button "Search Workspace 1789845695608":
      - img
      - text: Search Workspace 1789845695608
- list:
  - listitem:
    - button "Home":
      - img
      - text: Home
  - listitem:
    - link "Direct messages":
      - /url: /dms
      - img
      - text: DMs
  - listitem:
    - link "Activity":
      - /url: /activity
      - img
      - text: Activity
  - listitem:
    - button "More":
      - img
      - text: More
  - listitem:
    - button "Admin":
      - img
      - text: Admin
  - listitem:
    - button "Create":
      - img
      - text: Create
- list:
  - listitem:
    - button "Toggle theme":
      - img
      - text: Toggle theme
  - listitem:
    - button "SE"
- button "Toggle Sidebar"
- main:
  - button "Search messages, people, settings... ⌘ K":
    - img
    - text: Search messages, people, settings... ⌘ K
  - button "Go back":
    - img
  - button "Go forward":
    - img
  - button "Open help":
    - img
  - complementary:
    - paragraph: Workspace
    - paragraph: Your conversations
    - text: Live
    - button "Create channel":
      - img
    - text: Search conversations
    - searchbox "Search conversations"
    - list "Conversation list":
      - button "Channels" [expanded]:
        - img
        - text: Channels
      - text: "1"
      - listitem:
        - text: SE
        - paragraph: "# search-1789845695639"
        - paragraph: Search Workspace 1789845695608
        - text: 10:21 PM
        - paragraph: "You: search-proof-1789845695657"
      - button "Direct messages" [expanded]:
        - img
        - text: Direct messages
      - button "Start direct message":
        - img
      - button "SE offline active Search User (you)": SE active Search User (you)
      - button "Starred" [expanded]:
        - img
        - text: Starred
      - text: Drag and drop important stuff here
      - button "Hide starred hint": ▾
      - button "Huddles":
        - img
        - text: Huddles
      - button "Directories":
        - img
        - text: Directories
  - main:
    - button "Close workspace":
      - img
    - text: SE
    - paragraph: "# search-1789845695639"
    - paragraph: Search Workspace 1789845695608
    - button "Star conversation":
      - img
    - button "Invite teammates"
    - button "Mute conversation":
      - img
    - button "Start audio call":
      - img
    - button "Huddle"
    - button "Start video call":
      - img
    - button "Open conversation menu":
      - img
    - button "Messages"
    - button "Add canvas"
    - button "+"
    - 'searchbox "Search messages in # search-1789845695639"': search-proof-1789845695657
    - paragraph: Search is temporarily unavailable
    - text: September 19, 2026
    - group "You at 10:21 PM":
      - text: YO
      - button "Reply in thread":
        - img
      - button "Add reaction": 😊
      - button "More message actions":
        - img
      - paragraph: You 10:21 PM
      - text: search-proof-1789845695657
    - form "Reply composer":
      - text: Write a message
      - button "Attach a file":
        - img
      - button "Toggle formatting toolbar": Aa
      - button "Insert emoji": 😊
      - button "Mention a user": "@"
      - 'textbox "Message # search-1789845695639"': "Message # search-1789845695639 (Enter to send, Shift+Enter for newline)"
      - button "Attach content":
        - img
      - button "More composer options":
        - img
      - button "Send message" [disabled]:
        - img
      - button "Schedule message":
        - img
      - button "Expand composer": ↕
    - text: "You at 10:21 PM: search-proof-1789845695657"
  - button "Threads":
    - img
  - button "Saved items":
    - img
  - heading "Documentation" [level=2]
  - button "Close info panel":
    - img
  - heading "Getting Started" [level=3]
  - paragraph: Learn how to get started with this application.
  - heading "Learn more" [level=4]
  - list:
    - listitem:
      - link "Installation Guide":
        - /url: "#"
        - text: Installation Guide
        - img
  - button "Toggle Infobar"
- button "Open Tanstack query devtools":
  - img
- alert
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | import {
  3  |   apiRequest,
  4  |   registerUser,
  5  |   signIn,
  6  |   startRealBackend,
  7  |   stopBackendProcesses,
  8  | } from "./support/real-services";
  9  | 
  10 | test("searches real channel messages and opens the matching result", async ({
  11 |   browser,
  12 | }) => {
  13 |   test.slow();
  14 |   await startRealBackend();
  15 |   try {
  16 |     const user = await registerUser(
  17 |       `search-${Date.now()}@example.test`,
  18 |       "Search User",
  19 |     );
  20 |     const workspace = await apiRequest("POST", "/api/workspaces", user.cookie, {
  21 |       name: `Search Workspace ${Date.now()}`,
  22 |     });
  23 |     expect(workspace.status).toBe(201);
  24 |     const channel = await apiRequest("POST", "/api/channels", user.cookie, {
  25 |       workspace_id: workspace.body.id,
  26 |       name: `search-${Date.now()}`,
  27 |       type: "PUBLIC",
  28 |     });
  29 |     expect(channel.status).toBe(201);
  30 |     const content = `search-proof-${Date.now()}`;
  31 |     const message = await apiRequest(
  32 |       "POST",
  33 |       `/api/channels/${channel.body.id}/messages`,
  34 |       user.cookie,
  35 |       { content },
  36 |     );
  37 |     expect(message.status).toBe(201);
  38 | 
  39 |     const context = await browser.newContext();
  40 |     const page = await context.newPage();
  41 |     try {
  42 |       await signIn(page, user.email);
  43 |       await page.goto(
  44 |         `http://localhost:3000/home/${workspace.body.id}/channels/${channel.body.id}`,
  45 |       );
  46 |       const search = page.getByRole("searchbox", {
  47 |         name: /Search messages in/i,
  48 |       });
  49 |       await search.fill(content);
  50 |       const result = page.locator(
  51 |         `[data-testid="search-result-${message.body.id}"]`,
  52 |       );
> 53 |       await expect(result).toContainText(content);
     |                            ^ Error: expect(locator).toContainText(expected) failed
  54 |       await expect(result).toContainText("Search User");
  55 |       await expect(result).toContainText(`# ${channel.body.name}`);
  56 |       await expect(result).toContainText("/");
  57 |       await result.click();
  58 |       await expect(
  59 |         page.locator(`[data-message-id="${message.body.id}"]`),
  60 |       ).toBeVisible();
  61 |     } finally {
  62 |       await context.close();
  63 |     }
  64 |   } finally {
  65 |     stopBackendProcesses();
  66 |   }
  67 | });
  68 | 
```