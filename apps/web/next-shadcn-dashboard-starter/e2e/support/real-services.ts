import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, openSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export const apiBase = "http://localhost:8080";
const apiDir = join(process.cwd(), "..", "..", "api");
const goBinary = "C:/Users/User/bin/go.exe";
const binDir = join(apiDir, "bin");
const logDir = join(process.cwd(), "test-results", "real-services");
const coreBinary = join(binDir, "core.exe");
const gatewayBinary = join(binDir, "gateway.exe");
const servicePorts = [8080, 8081, 9090, 9091];

function loadApiEnv(): Record<string, string> {
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

function killPortOwners() {
  for (const port of servicePorts) {
    try {
      const output = execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue).OwningProcess`,
        ],
        { encoding: "utf8" },
      );
      for (const rawPid of output.split(/\r?\n/)) {
        const pid = Number(rawPid.trim());
        if (pid > 0)
          execFileSync("taskkill", ["/PID", String(pid), "/F", "/T"]);
      }
    } catch {
      // No listener or the process exited during cleanup.
    }
  }
}

export function stopBackendProcesses() {
  killPortOwners();
}

function buildServices() {
  mkdirSync(binDir, { recursive: true });
  mkdirSync(logDir, { recursive: true });
  const coreStartedAt = Date.now();
  execFileSync(goBinary, ["build", "-o", coreBinary, "./cmd/core"], {
    cwd: apiDir,
    stdio: "inherit",
  });
  console.log(`[harness] go build core.exe: ${Date.now() - coreStartedAt}ms`);
  const gatewayStartedAt = Date.now();
  execFileSync(goBinary, ["build", "-o", gatewayBinary, "./cmd/gateway"], {
    cwd: apiDir,
    stdio: "inherit",
  });
  console.log(
    `[harness] go build gateway.exe: ${Date.now() - gatewayStartedAt}ms`,
  );
}

function serviceEnv(extra: Record<string, string>) {
  return {
    ...process.env,
    ...loadApiEnv(),
    GATEWAY_GRPC_ADDR: "localhost:9090",
    CORE_GRPC_ADDR: "localhost:9091",
    FRONTEND_URL: "http://localhost:3000",
    APP_ENV: "development",
    KAFKA_BROKER_ADDR: "localhost:19092",
    REDIS_ADDR: "localhost:6379",
    ELASTICSEARCH_URL: "http://127.0.0.1:9200",
    S3_ENDPOINT: "127.0.0.1:9000",
    S3_BUCKET: "slack-uploads",
    S3_USE_SSL: "false",
    ...extra,
  };
}

function spawnService(
  binary: string,
  logName: string,
  env: Record<string, string | undefined>,
): ChildProcess {
  const log = openSync(join(logDir, logName), "w");
  const child = spawn(binary, [], {
    cwd: apiDir,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", log, log],
    env: env as NodeJS.ProcessEnv,
  }) as ChildProcess;
  child.unref();
  return child;
}

export function startCoreService() {
  return spawnService(
    coreBinary,
    "core.log",
    serviceEnv({ CORE_HTTP_ADDR: ":8080", GATEWAY_HTTP_ADDR: "" }),
  );
}

export function startGatewayService() {
  return spawnService(
    gatewayBinary,
    "gateway.log",
    serviceEnv({ CORE_HTTP_ADDR: "", GATEWAY_HTTP_ADDR: ":8081" }),
  );
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

async function waitForApiReady() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${apiBase}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `readiness-${Date.now()}@example.test`,
          password: "password123",
          display_name: "Readiness Probe",
        }),
      });
      if (response.status === 201 || response.status === 409) return;
    } catch {
      // Core is still starting.
    }
    await delay(500);
  }
  throw new Error("Core API did not pass the registration readiness probe");
}

async function resetSearchIndex() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:9200/messages", {
        method: "DELETE",
      });
      if (response.status === 200 || response.status === 404) return;
    } catch {
      // Elasticsearch is still starting.
    }
    await delay(500);
  }
  throw new Error("Elasticsearch did not become ready to reset messages index");
}

export async function startRealBackend() {
  stopBackendProcesses();
  await resetSearchIndex();
  buildServices();
  startCoreService();
  await waitForApiReady();
  startGatewayService();
  await waitForPort(8081);
}

export function authCookie(response: Response) {
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("server did not return an auth cookie");
  return cookie;
}

export async function apiRequest(
  method: "GET" | "POST",
  path: string,
  cookie: string,
  payload?: Record<string, unknown>,
) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: payload ? JSON.stringify(payload) : undefined,
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

export async function registerUser(email: string, name: string) {
  const response = await fetch(`${apiBase}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: "password123",
      display_name: name,
    }),
  });
  if (response.status !== 201)
    throw new Error(`register failed: ${response.status}`);
  return { email, cookie: authCookie(response) };
}

export async function signIn(
  page: import("@playwright/test").Page,
  email: string,
) {
  await page.goto("http://localhost:3000/auth/sign-in");
  await page.getByPlaceholder(/Email/i).fill(email);
  await page.getByPlaceholder(/Password/i).fill("password123");
  await page
    .getByRole("button", { name: /^Sign In$/i })
    .nth(1)
    .click();
  await page.waitForURL(/\/workspaces$/);
}
