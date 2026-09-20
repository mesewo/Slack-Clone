# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: phase1-unread-presence.spec.ts >> phase 1 unread and presence wiring >> shows unread counts for new channel messages and active presence for members
- Location: e2e\phase1-unread-presence.spec.ts:205:7

# Error details

```
Error: expect(locator).toHaveAttribute(expected) failed

Locator: locator('[data-testid="inline-video-adb69db5-3b87-47b1-b1f8-2850b748ed97"]')
Expected: ""
Timeout: 20000ms
Error: element(s) not found

Call log:
  - Expect "toHaveAttribute" locator('[data-testid="inline-video-adb69db5-3b87-47b1-b1f8-2850b748ed97"]') with timeout 20000ms
  - waiting for locator('[data-testid="inline-video-adb69db5-3b87-47b1-b1f8-2850b748ed97"]')

```

```yaml
- heading "Something went wrong" [level=1]
- paragraph: An unexpected error occurred. Please try again.
- button "Try again"
```

# Test source

```ts
  254 |         workspace_id: workspaceId,
  255 |         name: `phase1-${Date.now()}`,
  256 |         type: "PUBLIC",
  257 |       });
  258 |       expect(channel.status).toBe(201);
  259 |       const channelId = channel.body.id;
  260 | 
  261 |       const presign = await apiRequest(
  262 |         "POST",
  263 |         "/api/uploads/presign",
  264 |         userA.cookie,
  265 |         {
  266 |           filename: "phase1-proof.mp4",
  267 |           content_type: "video/mp4",
  268 |           size_bytes: 16,
  269 |         },
  270 |       );
  271 |       expect(presign.status).toBe(200);
  272 |       const putVideo = await fetch(presign.body.upload_url, {
  273 |         method: "PUT",
  274 |         headers: { "Content-Type": "video/mp4" },
  275 |         body: new Uint8Array(16),
  276 |       });
  277 |       expect(putVideo.ok).toBeTruthy();
  278 |       const completeVideo = await apiRequest(
  279 |         "POST",
  280 |         "/api/uploads/complete",
  281 |         userA.cookie,
  282 |         { session_id: presign.body.session_id },
  283 |       );
  284 |       expect(completeVideo.status).toBe(200);
  285 |       const videoAttachmentId = completeVideo.body.id;
  286 |       const videoMessage = `phase1-video-${Date.now()}`;
  287 |       const createVideoMessage = await apiRequest(
  288 |         "POST",
  289 |         `/api/channels/${channelId}/messages`,
  290 |         userA.cookie,
  291 |         {
  292 |           content: videoMessage,
  293 |           attachment_ids: [videoAttachmentId],
  294 |         },
  295 |       );
  296 |       expect(createVideoMessage.status).toBe(201);
  297 | 
  298 |       const quietChannel = await apiRequest(
  299 |         "POST",
  300 |         "/api/channels",
  301 |         userA.cookie,
  302 |         {
  303 |           workspace_id: workspaceId,
  304 |           name: `phase1-quiet-${Date.now()}`,
  305 |           type: "PUBLIC",
  306 |         },
  307 |       );
  308 |       expect(quietChannel.status).toBe(201);
  309 |       const quietChannelId = quietChannel.body.id;
  310 | 
  311 |       const offlineDM = await apiRequest("POST", "/api/dms", userB.cookie, {
  312 |         user_id: userC.id,
  313 |       });
  314 |       expect(offlineDM.status).toBe(200);
  315 | 
  316 |       const joinChannelResponse = await apiRequest(
  317 |         "POST",
  318 |         `/api/channels/${channelId}/join`,
  319 |         userB.cookie,
  320 |         {},
  321 |       );
  322 |       expect([200, 201, 204, 409]).toContain(joinChannelResponse.status);
  323 | 
  324 |       const joinQuietChannelResponse = await apiRequest(
  325 |         "POST",
  326 |         `/api/channels/${quietChannelId}/join`,
  327 |         userB.cookie,
  328 |         {},
  329 |       );
  330 |       expect([200, 201, 204, 409]).toContain(joinQuietChannelResponse.status);
  331 | 
  332 |       const contextA = await browser.newContext();
  333 |       const contextB = await browser.newContext();
  334 |       const pageA = await contextA.newPage();
  335 |       const pageB = await contextB.newPage();
  336 | 
  337 |       await loginViaBrowser(pageA, userA.email, "password123");
  338 |       await loginViaBrowser(pageB, userB.email, "password123");
  339 | 
  340 |       await pageA.goto(
  341 |         `http://localhost:3000/home/${workspaceId}/channels/${channelId}`,
  342 |       );
  343 |       await pageB.goto(
  344 |         `http://localhost:3000/home/${workspaceId}/channels/${channelId}`,
  345 |       );
  346 |       await expect(pageA).toHaveURL(
  347 |         new RegExp(`/home/${workspaceId}/channels/${channelId}`),
  348 |       );
  349 |       await expect(pageB).toHaveURL(
  350 |         new RegExp(`/home/${workspaceId}/channels/${channelId}`),
  351 |       );
  352 |       await expect(
  353 |         pageA.locator(`[data-testid="inline-video-${videoAttachmentId}"]`),
> 354 |       ).toHaveAttribute("controls", "");
      |         ^ Error: expect(locator).toHaveAttribute(expected) failed
  355 |       await expect(
  356 |         pageA.getByRole("button", { name: "Download phase1-proof.mp4" }),
  357 |       ).toBeVisible();
  358 | 
  359 |       const searchInput = pageA.getByRole("searchbox", {
  360 |         name: /Search messages in/i,
  361 |       });
  362 |       await searchInput.fill(videoMessage);
  363 |       const searchResult = pageA.locator(
  364 |         `[data-testid="search-result-${createVideoMessage.body.id}"]`,
  365 |       );
  366 |       await expect(searchResult).toContainText(videoMessage);
  367 |       await expect(searchResult).toContainText("Alpha User");
  368 |       await expect(searchResult).toContainText("# phase1-");
  369 |       await searchResult.click();
  370 | 
  371 |       const unreadMessage = `phase1-unread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  372 |       const createMessage = await apiRequest(
  373 |         "POST",
  374 |         `/api/channels/${channelId}/messages`,
  375 |         userA.cookie,
  376 |         { content: unreadMessage },
  377 |       );
  378 |       expect(createMessage.status).toBe(201);
  379 | 
  380 |       await expect
  381 |         .poll(async () => (await pageB.locator("body").textContent()) ?? "", {
  382 |           timeout: 20000,
  383 |         })
  384 |         .toContain(unreadMessage);
  385 | 
  386 |       await pageB.reload();
  387 |       await expect(pageB.locator("body")).toContainText(unreadMessage);
  388 | 
  389 |       await pageB.goto(`http://localhost:3000/home/${workspaceId}`);
  390 |       await expect(
  391 |         pageB.locator(`[data-testid="presence-dot-${channelId}"]`),
  392 |       ).toBeVisible();
  393 |       await pageB.goto(
  394 |         `http://localhost:3000/home/${workspaceId}/channels/${quietChannelId}`,
  395 |       );
  396 |       await expect(pageB).toHaveURL(
  397 |         new RegExp(`/home/${workspaceId}/channels/${quietChannelId}`),
  398 |       );
  399 |       const markReadBeforeUnread = await apiRequest(
  400 |         "POST",
  401 |         `/api/channels/${channelId}/read`,
  402 |         userB.cookie,
  403 |         {},
  404 |       );
  405 |       expect([200, 204]).toContain(markReadBeforeUnread.status);
  406 |       const secondMessage = `phase1-unread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  407 |       const createUnreadMessage = await apiRequest(
  408 |         "POST",
  409 |         `/api/channels/${channelId}/messages`,
  410 |         userA.cookie,
  411 |         { content: secondMessage },
  412 |       );
  413 |       expect(createUnreadMessage.status).toBe(201);
  414 |       await expect
  415 |         .poll(
  416 |           async () =>
  417 |             (
  418 |               await apiRequest(
  419 |                 "GET",
  420 |                 `/api/channels/${channelId}/unread`,
  421 |                 userB.cookie,
  422 |               )
  423 |             ).body?.unread,
  424 |           { timeout: 20000 },
  425 |         )
  426 |         .toBe(1);
  427 | 
  428 |       const unreadBadge = pageB.locator(
  429 |         `[data-testid="unread-badge-${channelId}"]`,
  430 |       );
  431 |       await expect(unreadBadge).toHaveText("1");
  432 | 
  433 |       const positivePresence = pageB.locator(
  434 |         `[data-testid="presence-dot-${channelId}"]`,
  435 |       );
  436 |       await expect(positivePresence).toHaveAttribute("aria-label", "active");
  437 | 
  438 |       const offlineDMRow = pageB.getByRole("button", {
  439 |         name: /Offline User/i,
  440 |       });
  441 |       await expect(offlineDMRow).toBeVisible();
  442 |       const offlinePresence = offlineDMRow.locator(
  443 |         '[data-testid^="presence-dot-dm:"]',
  444 |       );
  445 |       await expect(offlinePresence).toHaveAttribute("aria-label", "offline");
  446 | 
  447 |       await pageB.goto(
  448 |         `http://localhost:3000/home/${workspaceId}/channels/${channelId}`,
  449 |       );
  450 |       await expect(
  451 |         pageB.locator(`[data-testid="unread-badge-${channelId}"]`),
  452 |       ).toHaveCount(0);
  453 | 
  454 |       await contextA.close();
```