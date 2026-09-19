# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dnd-presence.spec.ts >> user DND status is visible to another user
- Location: e2e\dnd-presence.spec.ts:129:5

# Error details

```
Error: locator.click: Target crashed 
Call log:
  - waiting for getByRole('button', { name: 'Open conversation menu' })
    - locator resolved to <button tabindex="0" type="button" data-slot="button" aria-expanded="false" aria-label="Open conversation menu" class="group/button inline-flex shrink-0 items-center justify-center bg-clip-padding text-sm font-medium whitespace-nowrap outline-none select-none focus-visible:border-ring active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark…>…</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <button tabindex="0" type="button" title="Threads" data-slot="button" aria-label="Threads" class="group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-…>…</button> from <div class="absolute right-3 top-3 z-40 flex flex-col gap-1 rounded-lg border bg-background/95 p-1 shadow-[0_8px_24px_rgba(15,23,42,0.12)] backdrop-blur">…</div> subtree intercepts pointer events
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <button tabindex="0" type="button" title="Threads" data-slot="button" aria-label="Threads" class="group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-…>…</button> from <div class="absolute right-3 top-3 z-40 flex flex-col gap-1 rounded-lg border bg-background/95 p-1 shadow-[0_8px_24px_rgba(15,23,42,0.12)] backdrop-blur">…</div> subtree intercepts pointer events
    - retrying click action
      - waiting 100ms
    382 × waiting for element to be visible, enabled and stable
        - element is visible, enabled and stable
        - scrolling into view if needed
        - done scrolling
        - <button tabindex="0" type="button" title="Threads" data-slot="button" aria-label="Threads" class="group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-…>…</button> from <div class="absolute right-3 top-3 z-40 flex flex-col gap-1 rounded-lg border bg-background/95 p-1 shadow-[0_8px_24px_rgba(15,23,42,0.12)] backdrop-blur">…</div> subtree intercepts pointer events
      - retrying click action
        - waiting 500ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling

```

# Test source

```ts
  98  |     }),
  99  |   });
  100 |   expect(response.status).toBe(201);
  101 |   return { email, cookie: authCookie(response) };
  102 | }
  103 | 
  104 | async function apiRequest(
  105 |   method: "POST" | "PATCH",
  106 |   path: string,
  107 |   cookie: string,
  108 |   body: Record<string, unknown>,
  109 | ) {
  110 |   const response = await fetch(`${apiBase}${path}`, {
  111 |     method,
  112 |     headers: { "Content-Type": "application/json", Cookie: cookie },
  113 |     body: JSON.stringify(body),
  114 |   });
  115 |   return { status: response.status, body: await response.json() };
  116 | }
  117 | 
  118 | async function signIn(page: import("@playwright/test").Page, email: string) {
  119 |   await page.goto("http://localhost:3000/auth/sign-in");
  120 |   await page.getByPlaceholder(/Email/i).fill(email);
  121 |   await page.getByPlaceholder(/Password/i).fill("password123");
  122 |   await page
  123 |     .getByRole("button", { name: /^Sign In$/i })
  124 |     .nth(1)
  125 |     .click();
  126 |   await page.waitForURL(/\/workspaces$/);
  127 | }
  128 | 
  129 | test("user DND status is visible to another user", async ({ browser }) => {
  130 |   test.slow();
  131 |   stopBackendProcesses();
  132 |   startService("core");
  133 |   await waitForPort(8080);
  134 |   startService("gateway");
  135 |   await waitForPort(8081);
  136 | 
  137 |   try {
  138 |     const userA = await register(
  139 |       `dnd-a-${Date.now()}@example.test`,
  140 |       "DND Alpha",
  141 |     );
  142 |     const userB = await register(
  143 |       `dnd-b-${Date.now()}@example.test`,
  144 |       "DND Beta",
  145 |     );
  146 |     const workspace = await apiRequest(
  147 |       "POST",
  148 |       "/api/workspaces",
  149 |       userA.cookie,
  150 |       {
  151 |         name: `DND Workspace ${Date.now()}`,
  152 |       },
  153 |     );
  154 |     expect(workspace.status).toBe(201);
  155 |     const joined = await apiRequest(
  156 |       "POST",
  157 |       "/api/workspaces/join",
  158 |       userB.cookie,
  159 |       {
  160 |         slug: workspace.body.slug,
  161 |       },
  162 |     );
  163 |     expect(joined.status).toBe(200);
  164 |     const channel = await apiRequest("POST", "/api/channels", userA.cookie, {
  165 |       workspace_id: workspace.body.id,
  166 |       name: `dnd-${Date.now()}`,
  167 |       type: "PUBLIC",
  168 |     });
  169 |     expect(channel.status).toBe(201);
  170 |     for (const cookie of [userA.cookie, userB.cookie]) {
  171 |       const joinedChannel = await fetch(
  172 |         `${apiBase}/api/channels/${channel.body.id}/join`,
  173 |         {
  174 |           method: "POST",
  175 |           headers: { Cookie: cookie, "Content-Type": "application/json" },
  176 |           body: "{}",
  177 |         },
  178 |       );
  179 |       expect([200, 201, 204, 409]).toContain(joinedChannel.status);
  180 |     }
  181 | 
  182 |     const contextA = await browser.newContext();
  183 |     const contextB = await browser.newContext();
  184 |     const pageA = await contextA.newPage();
  185 |     const pageB = await contextB.newPage();
  186 |     try {
  187 |       await signIn(pageA, userA.email);
  188 |       await signIn(pageB, userB.email);
  189 |       await pageA.goto("http://localhost:3000/dashboard/profile");
  190 |       await pageA.getByLabel("Presence status").selectOption("dnd");
  191 |       await expect(pageA.getByLabel("Presence status")).toHaveValue("dnd");
  192 | 
  193 |       await pageB.goto(
  194 |         `http://localhost:3000/home/${workspace.body.id}/channels/${channel.body.id}`,
  195 |       );
  196 |       await pageB
  197 |         .getByRole("button", { name: "Open conversation menu" })
> 198 |         .click();
      |          ^ Error: locator.click: Target crashed 
  199 |       await pageB.getByRole("button", { name: "Channel members" }).click();
  200 |       await expect(
  201 |         pageB.locator('[aria-label="Online, do not disturb"]'),
  202 |       ).toBeVisible();
  203 |     } finally {
  204 |       await contextA.close();
  205 |       await contextB.close();
  206 |     }
  207 |   } finally {
  208 |     stopBackendProcesses();
  209 |   }
  210 | });
  211 | 
```