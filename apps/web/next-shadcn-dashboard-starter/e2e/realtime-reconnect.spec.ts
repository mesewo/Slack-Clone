import { test, expect } from "@playwright/test";
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const apiBase = "http://localhost:8080";
const apiDir = join(process.cwd(), "..", "..", "api");
const goBinary = "C:/Users/User/bin/go.exe";

function loadApiEnv(): Record<string, string> {
  const envFile = join(apiDir, ".env");
  const values: Record<string, string> = {};

  try {
    const raw = readFileSync(envFile, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed
        .slice(eqIndex + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");
      if (key) values[key] = value;
    }
  } catch {
    // The API environment file is expected to exist in the local repo setup.
  }

  return values;
}

const apiEnv = loadApiEnv();

function runPowerShell(command: string): string {
  return execSync(
    `powershell -NoProfile -Command "${command.replace(/"/g, '""')}"`,
    {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    },
  ).trim();
}

function stopProcessByCommandPattern(pattern: string) {
  try {
    runPowerShell(
      `$procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue; if ($procs) { $procs | Where-Object { $_.CommandLine -match '${pattern.replace(/'/g, "''")}' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } }`,
    );
  } catch {
    // Ignore shutdown races: the process may already be gone.
  }
}

function startService(service: "core" | "gateway"): ChildProcess {
  const required = ["DATABASE_URL", "JWT_SECRET"] as const;
  for (const key of required) {
    if (!apiEnv[key]) {
      throw new Error(
        `Missing ${key} in apps/api/.env. Keep secrets in the API env file, not in the Playwright spec.`,
      );
    }
  }

  const proc = spawn(goBinary, ["run", `./cmd/${service}`], {
    cwd: apiDir,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", "ignore", "ignore"],
    env: {
      ...apiEnv,
      ...process.env,
      GATEWAY_GRPC_ADDR: "localhost:9090",
      CORE_GRPC_ADDR: "localhost:9091",
      KAFKA_BROKER_ADDR: "localhost:19092",
      REDIS_ADDR: "localhost:6379",
      ELASTICSEARCH_URL: "http://127.0.0.1:9200",
      FRONTEND_URL: "http://localhost:3000",
      APP_ENV: "development",
      S3_ENDPOINT: "127.0.0.1:9000",
      S3_BUCKET: "slack-uploads",
      S3_USE_SSL: "false",
      GATEWAY_HTTP_ADDR: service === "gateway" ? ":8081" : "",
      CORE_HTTP_ADDR: service === "core" ? ":8080" : "",
    },
  });
  proc.unref();
  return proc;
}

function stopGateway() {
  stopProcessByCommandPattern("go.exe run ./cmd/gateway");
}

function stopCore() {
  stopProcessByCommandPattern("go.exe run ./cmd/core");
}

async function waitForRuntime(port: number, timeoutMs = 120000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://localhost:${port}/`, {
        method: "GET",
      });
      if (response.status >= 200 && response.status < 500) return;
    } catch {
      // expected while service is still booting
    }
    await delay(500);
  }
  throw new Error(`port ${port} did not become ready in time`);
}

function parseAuthCookie(setCookie: string | null): string {
  if (!setCookie) throw new Error("server did not return an auth cookie");
  const [rawToken] = setCookie.split(";");
  const [name, ...valueParts] = rawToken.split("=");
  const value = valueParts.join("=");
  if (!name || !value) throw new Error("failed to parse auth cookie");
  return `${name}=${value}`;
}

function countLiteralOccurrences(text: string, value: string): number {
  if (!value) return 0;
  return text.split(value).length - 1;
}

async function apiRequest(
  method: "GET" | "POST" | "DELETE",
  path: string,
  cookie: string,
  payload?: Record<string, unknown>,
) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: payload ? JSON.stringify(payload) : undefined,
    credentials: "include",
  });

  const text = await response.text();
  let body: any = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  return { status: response.status, body, headers: response.headers };
}

async function registerUser(email: string, password: string, name: string) {
  const response = await fetch(`${apiBase}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password, display_name: name }),
  });

  if (response.status !== 201) {
    const text = await response.text();
    throw new Error(`register failed: ${response.status} ${text}`);
  }

  const cookie = parseAuthCookie(response.headers.get("set-cookie"));
  const body = await response.json();
  return {
    email,
    token: cookie.split("=")[1],
    cookie,
    id: body.id,
  };
}

async function loginViaBrowser(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
) {
  await page.goto("http://localhost:3000/auth/sign-in");
  await page.getByPlaceholder(/Email/i).fill(email);
  await page.getByPlaceholder(/Password/i).fill(password);
  await page
    .getByRole("button", { name: /^Sign In$/i })
    .nth(1)
    .click();
  await page.waitForURL(/\/workspaces$/);
}

test.describe("realtime reconnect", () => {
  test("automatically reconnects after gateway interruption and resyncs history without duplicates", async ({
    browser,
  }) => {
    test.slow();

    startService("core");
    await waitForRuntime(8080);
    startService("gateway");
    await waitForRuntime(8081);

    try {
      const userA = await registerUser(
        `playwright-a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`,
        "password123",
        "Alpha User",
      );
      const userB = await registerUser(
        `playwright-b-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`,
        "password123",
        "Beta User",
      );

      const workspace = await apiRequest(
        "POST",
        "/api/workspaces",
        userA.cookie,
        { name: `Realtime-${Date.now()}` },
      );
      expect(workspace.status).toBe(201);
      const workspaceId = workspace.body.id;
      const workspaceSlug = workspace.body.slug;

      const joinResponse = await apiRequest(
        "POST",
        "/api/workspaces/join",
        userB.cookie,
        { slug: workspaceSlug },
      );
      expect(joinResponse.status).toBe(200);

      const channel = await apiRequest("POST", "/api/channels", userA.cookie, {
        workspace_id: workspaceId,
        name: `reconnect-${Date.now()}`,
        type: "PUBLIC",
      });
      expect(channel.status).toBe(201);
      const channelId = channel.body.id;

      const joinChannelResponse = await apiRequest(
        "POST",
        `/api/channels/${channelId}/join`,
        userB.cookie,
        {},
      );
      expect([200, 201, 204, 409]).toContain(joinChannelResponse.status);

      const contextA = await browser.newContext();
      const contextB = await browser.newContext();
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      await loginViaBrowser(pageA, userA.email, "password123");
      await loginViaBrowser(pageB, userB.email, "password123");
      await pageA.goto(
        `http://localhost:3000/home/${workspaceId}/channels/${channelId}`,
      );
      await pageB.goto(
        `http://localhost:3000/home/${workspaceId}/channels/${channelId}`,
      );
      await expect(pageA).toHaveURL(
        new RegExp(`/home/${workspaceId}/channels/${channelId}`),
      );
      await expect(pageB).toHaveURL(
        new RegExp(`/home/${workspaceId}/channels/${channelId}`),
      );

      const baselineMessage = `baseline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const baselineStatus = await apiRequest(
        "POST",
        `/api/channels/${channelId}/messages`,
        userA.cookie,
        { content: baselineMessage },
      );
      expect(baselineStatus.status).toBe(201);
      await expect
        .poll(async () => (await pageB.locator("body").textContent()) ?? "", {
          timeout: 20000,
        })
        .toContain(baselineMessage);

      stopGateway();
      const outageMessageOne = `outage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const outageMessageTwo = `outage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await apiRequest(
        "POST",
        `/api/channels/${channelId}/messages`,
        userA.cookie,
        { content: outageMessageOne },
      );
      await apiRequest(
        "POST",
        `/api/channels/${channelId}/messages`,
        userA.cookie,
        { content: outageMessageTwo },
      );
      await delay(2500);

      startService("gateway");
      await waitForRuntime(8081, 30000);
      await expect
        .poll(
          async () => {
            const text = (await pageB.locator("body").textContent()) ?? "";
            return (
              text.includes(outageMessageOne) && text.includes(outageMessageTwo)
            );
          },
          { timeout: 30000 },
        )
        .toBeTruthy();

      const thread = pageB.locator('[aria-label^="Message thread with "]');
      const threadText = (await thread.textContent()) ?? "";
      expect(countLiteralOccurrences(threadText, outageMessageOne)).toBe(1);
      expect(countLiteralOccurrences(threadText, outageMessageTwo)).toBe(1);

      const postRecoveryMessage = `recovery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const postRecoveryStatus = await apiRequest(
        "POST",
        `/api/channels/${channelId}/messages`,
        userA.cookie,
        { content: postRecoveryMessage },
      );
      expect(postRecoveryStatus.status).toBe(201);
      await expect
        .poll(async () => (await pageB.locator("body").textContent()) ?? "", {
          timeout: 30000,
        })
        .toContain(postRecoveryMessage);

      await expect
        .poll(
          async () => {
            const text = (await thread.textContent()) ?? "";
            return countLiteralOccurrences(text, postRecoveryMessage);
          },
          { timeout: 15000 },
        )
        .toBe(1);

      await contextA.close();
      await contextB.close();
    } finally {
      stopGateway();
      stopCore();
    }
  });
});
