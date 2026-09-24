import { test, expect } from "@playwright/test";
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const apiBase = "http://localhost:8080";
const apiDir = join(process.cwd(), "..", "..", "api");
const goBinary = "C:/Users/User/bin/go.exe";

function loadEnv(): Record<string, string> {
  const values: Record<string, string> = {};
  const raw = readFileSync(join(apiDir, ".env"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 0) continue;
    values[trimmed.slice(0, separator).trim()] = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
  return values;
}

const apiEnv = loadEnv();

function powershell(command: string) {
  execSync(`powershell -NoProfile -Command "${command.replace(/"/g, '""')}"`, {
    stdio: ["ignore", "ignore", "ignore"],
  });
}

function stopBackendProcesses() {
  try {
    powershell(
      "$procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue; $procs | Where-Object { $_.CommandLine -match 'go.exe run ./cmd/(core|gateway)' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
    );
  } catch {
    // Processes may already be stopped.
  }
}

function startService(service: "core" | "gateway"): ChildProcess {
  return spawn(goBinary, ["run", `./cmd/${service}`], {
    cwd: apiDir,
    detached: true,
    windowsHide: true,
    stdio: "ignore",
    env: {
      ...process.env,
      ...apiEnv,
      GATEWAY_GRPC_ADDR: "localhost:9090",
      CORE_GRPC_ADDR: "localhost:9091",
      GATEWAY_HTTP_ADDR: service === "gateway" ? ":8081" : "",
      CORE_HTTP_ADDR: service === "core" ? ":8080" : "",
      FRONTEND_URL: "http://localhost:3000",
      APP_ENV: "development",
      KAFKA_BROKER_ADDR: "localhost:19092",
      REDIS_ADDR: "localhost:6379",
      ELASTICSEARCH_URL: "http://127.0.0.1:9200",
      S3_ENDPOINT: "127.0.0.1:9000",
      S3_BUCKET: "slack-uploads",
      S3_USE_SSL: "false",
    },
  });
}

async function waitForPort(port: number) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://localhost:${port}/`);
      if (response.status < 500) return;
    } catch {
      // Service is still starting.
    }
    await delay(500);
  }
  throw new Error(`port ${port} did not become ready`);
}

function authCookie(response: Response) {
  const value = response.headers.get("set-cookie")?.split(";")[0];
  if (!value) throw new Error("missing auth cookie");
  return value;
}

async function register(email: string, name: string) {
  const response = await fetch(`${apiBase}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: "password123",
      display_name: name,
    }),
  });
  expect(response.status).toBe(201);
  return { email, cookie: authCookie(response) };
}

async function apiRequest(
  method: "POST" | "PATCH",
  path: string,
  cookie: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("http://localhost:3000/auth/sign-in");
  await page.getByPlaceholder(/Email/i).fill(email);
  await page.getByPlaceholder(/Password/i).fill("password123");
  await page
    .getByRole("button", { name: /^Sign In$/i })
    .nth(1)
    .click();
  await page.waitForURL(/\/workspaces$/);
}

test("user DND status is visible to another user", async ({ browser }) => {
  test.slow();
  stopBackendProcesses();
  startService("core");
  await waitForPort(8080);
  startService("gateway");
  await waitForPort(8081);

  try {
    const userA = await register(
      `dnd-a-${Date.now()}@example.test`,
      "DND Alpha",
    );
    const userB = await register(
      `dnd-b-${Date.now()}@example.test`,
      "DND Beta",
    );
    const workspace = await apiRequest(
      "POST",
      "/api/workspaces",
      userA.cookie,
      {
        name: `DND Workspace ${Date.now()}`,
      },
    );
    expect(workspace.status).toBe(201);
    const joined = await apiRequest(
      "POST",
      "/api/workspaces/join",
      userB.cookie,
      {
        slug: workspace.body.slug,
      },
    );
    expect(joined.status).toBe(200);
    const channel = await apiRequest("POST", "/api/channels", userA.cookie, {
      workspace_id: workspace.body.id,
      name: `dnd-${Date.now()}`,
      type: "PUBLIC",
    });
    expect(channel.status).toBe(201);
    for (const cookie of [userA.cookie, userB.cookie]) {
      const joinedChannel = await fetch(
        `${apiBase}/api/channels/${channel.body.id}/join`,
        {
          method: "POST",
          headers: { Cookie: cookie, "Content-Type": "application/json" },
          body: "{}",
        },
      );
      expect([200, 201, 204, 409]).toContain(joinedChannel.status);
    }

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    try {
      await signIn(pageA, userA.email);
      await signIn(pageB, userB.email);
      await pageA.goto("http://localhost:3000/dashboard/profile");
      await pageA.getByLabel("Presence status").selectOption("dnd");
      await expect(pageA.getByLabel("Presence status")).toHaveValue("dnd");

      await pageB.goto(
        `http://localhost:3000/home/${workspace.body.id}/channels/${channel.body.id}`,
      );
      await pageB
        .getByRole("button", { name: "Open conversation menu" })
        .click();
      await pageB.getByRole("button", { name: "Channel members" }).click();
      await expect(
        pageB.locator('[aria-label="Online, do not disturb"]'),
      ).toBeVisible();
    } finally {
      await contextA.close();
      await contextB.close();
    }
  } finally {
    stopBackendProcesses();
  }
});
