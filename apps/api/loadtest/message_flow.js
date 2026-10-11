// Phase 7 load test: exercises the real Phase 1-4 path end to end
// (REST -> Core -> Postgres, plus the Kafka publish on message send) under
// concurrent load. This is what actually validates "the system holds up",
// not the circuit breakers/retries added earlier, which only protect against
// restarts, not sustained traffic.
//
// Run: k6 run apps/api/loadtest/message_flow.js
// Override target: k6 run -e BASE_URL=http://localhost:8080 apps/api/loadtest/message_flow.js
//
// Install k6: https://k6.io/docs/get-started/installation/ (brew install k6,
// choco install k6, or the apt/deb package - it's a standalone binary, not a
// Go or Node dependency, so it doesn't touch go.work or package.json).

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";

export function setup() {
  // One ID per test execution; shared with all VUs so reruns don't reuse
  // account emails already stored in the persistent Postgres database.
  const runID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return { runID };
}

// Custom metrics so the summary shows the numbers that actually matter for
// "does this hold up under load", not just k6's generic http_req_duration.
const messagesSent = new Counter("messages_sent");
const sendFailures = new Counter("send_failures");
const sendDuration = new Trend("message_send_duration", true);

export const options = {
  // Auth is stored in an HttpOnly cookie. Keep each VU's cookie between
  // iterations so its provisioned session remains authenticated.
  noCookiesReset: true,
  scenarios: {
    message_flow: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 20 }, // ramp up
        { duration: "2m", target: 20 }, // steady state - this is the number worth watching
        { duration: "30s", target: 100 }, // spike
        { duration: "1m", target: 100 }, // sustained spike
        { duration: "30s", target: 0 }, // ramp down
      ],
    },
  },
  thresholds: {
    // Tune these once you have a baseline run; they're starting guesses, not
    // numbers pulled from anywhere specific to this codebase.
    "http_req_duration{expected_response:true}": ["p(95)<500"],
    http_req_failed: ["rate<0.05"],
    checks: ["rate>0.95"],
    send_failures: ["count<50"],
  },
};

function jsonHeaders() {
  return {
    headers: {
      "Content-Type": "application/json",
    },
  };
}

// Each VU creates one account, workspace, and channel, then reuses them for
// its iterations. This keeps auth/setup work out of the sustained message
// workload, while the separate register/login checks still validate auth.
let vuState;

function initializeVU(runID) {
  const uid = `${runID}-${__VU}`;
  const email = `loadtest-${uid}@example.com`;
  const password = "LoadTest123!";

  // 1. Register
  const registerRes = http.post(
    `${BASE_URL}/api/auth/register`,
    JSON.stringify({ email, password, display_name: `Load Test ${uid}` }),
    jsonHeaders(),
  );
  if (
    !check(registerRes, {
      "register ok": (r) => r.status === 200 || r.status === 201,
    })
  ) {
    return null;
  }

  // 2. Login (separate call rather than trusting register's response shape,
  // since that's what a real client does and it exercises the login path too)
  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email, password }),
    jsonHeaders(),
  );
  if (!check(loginRes, { "login ok": (r) => r.status === 200 })) {
    return null;
  }
  // Auth responses set an HttpOnly cookie instead of returning the token in
  // JSON. k6's per-VU cookie jar stores it and sends it on later requests.

  // 3. Create a workspace for this VU
  const wsRes = http.post(
    `${BASE_URL}/api/workspaces`,
    JSON.stringify({ name: `Load Test Workspace ${uid}` }),
    jsonHeaders(),
  );
  if (
    !check(wsRes, {
      "workspace created": (r) => r.status === 200 || r.status === 201,
    })
  ) {
    return null;
  }
  const workspaceID = wsRes.json("id") || wsRes.json("workspace_id");

  // 4. Create a channel in it
  const chRes = http.post(
    `${BASE_URL}/api/channels`,
    JSON.stringify({ workspace_id: workspaceID, name: `general-${uid}` }),
    jsonHeaders(),
  );
  if (
    !check(chRes, {
      "channel created": (r) => r.status === 200 || r.status === 201,
    })
  ) {
    return null;
  }
  const channelID = chRes.json("id") || chRes.json("channel_id");
  if (!channelID) {
    check(channelID, { "channel response includes id": (id) => Boolean(id) });
    return null;
  }

  return { uid, channelID };
}

export default function (data) {
  // k6 runs each VU in its own JS runtime, so this state is isolated per VU.
  // noCookiesReset keeps that VU's auth cookie across its iterations.
  if (!vuState) {
    // A failed setup previously left vuState empty, so k6 retried registration
    // on every iteration and flooded the already-failing auth service.
    vuState = initializeVU(data.runID) || { setupFailed: true };
  }
  if (vuState.setupFailed) {
    sleep(1);
    return;
  }
  const { uid, channelID } = vuState;

  // 5. Steady-state loop: send + list, the hot path in everyday use
  for (let i = 0; i < 10; i++) {
    const start = Date.now();
    const sendRes = http.post(
      `${BASE_URL}/api/channels/${channelID}/messages`,
      JSON.stringify({ content: `load test message ${i} from ${uid}, iteration ${__ITER}` }),
      jsonHeaders(),
    );
    sendDuration.add(Date.now() - start);
    const ok = check(sendRes, {
      "message sent": (r) => r.status === 200 || r.status === 201,
    });
    if (ok) {
      messagesSent.add(1);
    } else {
      sendFailures.add(1);
    }

    if (i % 3 === 0) {
      const listRes = http.get(
        `${BASE_URL}/api/channels/${channelID}/messages`,
        jsonHeaders(),
      );
      check(listRes, { "list ok": (r) => r.status === 200 });
    }

    sleep(0.2 + Math.random() * 0.3); // a human doesn't send messages in a tight loop
  }
}
