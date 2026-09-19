# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: message-search.spec.ts >> searches real channel messages and opens the matching result
- Location: e2e\message-search.spec.ts:10:5

# Error details

```
Error: page.waitForURL: Navigation failed because page crashed!
=========================== logs ===========================
waiting for navigation until "load"
============================================================
```

# Test source

```ts
  122 | async function waitForPort(port: number) {
  123 |   const deadline = Date.now() + 120_000;
  124 |   while (Date.now() < deadline) {
  125 |     try {
  126 |       const response = await fetch(`http://localhost:${port}/`);
  127 |       if (response.status < 500) return;
  128 |     } catch {
  129 |       // Service is still starting.
  130 |     }
  131 |     await delay(500);
  132 |   }
  133 |   throw new Error(`port ${port} did not become ready`);
  134 | }
  135 | 
  136 | async function waitForApiReady() {
  137 |   const deadline = Date.now() + 120_000;
  138 |   while (Date.now() < deadline) {
  139 |     try {
  140 |       const response = await fetch(`${apiBase}/api/auth/register`, {
  141 |         method: "POST",
  142 |         headers: { "Content-Type": "application/json" },
  143 |         body: JSON.stringify({
  144 |           email: `readiness-${Date.now()}@example.test`,
  145 |           password: "password123",
  146 |           display_name: "Readiness Probe",
  147 |         }),
  148 |       });
  149 |       if (response.status === 201 || response.status === 409) return;
  150 |     } catch {
  151 |       // Core is still starting.
  152 |     }
  153 |     await delay(500);
  154 |   }
  155 |   throw new Error("Core API did not pass the registration readiness probe");
  156 | }
  157 | 
  158 | export async function startRealBackend() {
  159 |   stopBackendProcesses();
  160 |   buildServices();
  161 |   startCoreService();
  162 |   await waitForApiReady();
  163 |   startGatewayService();
  164 |   await waitForPort(8081);
  165 | }
  166 | 
  167 | export function authCookie(response: Response) {
  168 |   const cookie = response.headers.get("set-cookie")?.split(";")[0];
  169 |   if (!cookie) throw new Error("server did not return an auth cookie");
  170 |   return cookie;
  171 | }
  172 | 
  173 | export async function apiRequest(
  174 |   method: "GET" | "POST",
  175 |   path: string,
  176 |   cookie: string,
  177 |   payload?: Record<string, unknown>,
  178 | ) {
  179 |   const response = await fetch(`${apiBase}${path}`, {
  180 |     method,
  181 |     headers: { "Content-Type": "application/json", Cookie: cookie },
  182 |     body: payload ? JSON.stringify(payload) : undefined,
  183 |   });
  184 |   const text = await response.text();
  185 |   let body: any = null;
  186 |   if (text) {
  187 |     try {
  188 |       body = JSON.parse(text);
  189 |     } catch {
  190 |       body = text;
  191 |     }
  192 |   }
  193 |   return { status: response.status, body, headers: response.headers };
  194 | }
  195 | 
  196 | export async function registerUser(email: string, name: string) {
  197 |   const response = await fetch(`${apiBase}/api/auth/register`, {
  198 |     method: "POST",
  199 |     headers: { "Content-Type": "application/json" },
  200 |     body: JSON.stringify({
  201 |       email,
  202 |       password: "password123",
  203 |       display_name: name,
  204 |     }),
  205 |   });
  206 |   if (response.status !== 201)
  207 |     throw new Error(`register failed: ${response.status}`);
  208 |   return { email, cookie: authCookie(response) };
  209 | }
  210 | 
  211 | export async function signIn(
  212 |   page: import("@playwright/test").Page,
  213 |   email: string,
  214 | ) {
  215 |   await page.goto("http://localhost:3000/auth/sign-in");
  216 |   await page.getByPlaceholder(/Email/i).fill(email);
  217 |   await page.getByPlaceholder(/Password/i).fill("password123");
  218 |   await page
  219 |     .getByRole("button", { name: /^Sign In$/i })
  220 |     .nth(1)
  221 |     .click();
> 222 |   await page.waitForURL(/\/workspaces$/);
      |              ^ Error: page.waitForURL: Navigation failed because page crashed!
  223 | }
  224 | 
```