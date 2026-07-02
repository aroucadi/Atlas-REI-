const http = require("http");

function post(path, data, token) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const options = {
      hostname: "localhost",
      port: 3001,
      path: path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    if (token) {
      options.headers["Authorization"] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 400) {
            reject(
              new Error(
                `API Error ${res.statusCode}: ${JSON.stringify(parsed)}`,
              ),
            );
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${body}`));
        }
      });
    });

    req.on("error", (e) => reject(e));
    req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log("Starting API Integration Test...");
  try {
    const email = `test-user-${Date.now()}@atlasrei.com`;
    console.log(`1. Registering user: ${email}...`);
    const regRes = await post("/api/auth/register", {
      email: email,
      fullName: "Alexander Delano",
      passwordString: "password123",
    });
    console.log("✓ Registration Success:", regRes);

    console.log("2. Logging in...");
    const loginRes = await post("/api/auth/login", {
      email: email,
      passwordString: "password123",
    });
    console.log(
      "✓ Login Success. Token:",
      loginRes.accessToken.slice(0, 20) + "...",
    );
    const token = loginRes.accessToken;

    console.log("3. Running Property Underwriting...");
    const underwriteRes = await post(
      "/api/underwrite",
      {
        countryCode: "AE",
        purchasePrice: 1200000,
        grossRentalIncomeAnnual: 96000,
        serviceChargePerSqm: 25,
        interiorAreaSqm: 80,
        isOffPlan: false,
        financing: {
          downPaymentPct: 0.25,
          interestRate: 0.045,
          termMonths: 300,
        },
      },
      token,
    );
    console.log(
      "✓ Underwriting Success. Gross Yield:",
      (underwriteRes.metrics.grossYield * 100).toFixed(2) + "%",
    );
    console.log("Total Capital Required:", underwriteRes.totalCapitalRequired);

    console.log("4. Fetching Workspaces...");
    // Let's call GET workspaces. Wait, our post function is POST. Let's make a quick GET function.
    const getWorkspaces = () =>
      new Promise((resolve, reject) => {
        const req = http.get(
          {
            hostname: "localhost",
            port: 3001,
            path: "/api/workspaces",
            headers: { Authorization: `Bearer ${token}` },
          },
          (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => resolve(JSON.parse(body)));
          },
        );
        req.on("error", reject);
      });

    const workspaces = await getWorkspaces();
    console.log(
      "✓ Workspaces fetched:",
      workspaces.map((w) => ({ id: w.id, name: w.name })),
    );
    const activeWorkspace = workspaces[0];

    console.log("5. Fetching profiles for workspace...");
    const getProfiles = (wsId) =>
      new Promise((resolve, reject) => {
        const req = http.get(
          {
            hostname: "localhost",
            port: 3001,
            path: `/api/workspaces/${wsId}/profiles`,
            headers: { Authorization: `Bearer ${token}` },
          },
          (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => resolve(JSON.parse(body)));
          },
        );
        req.on("error", reject);
      });
    const profiles = await getProfiles(activeWorkspace.id);
    console.log(
      "✓ Profiles fetched:",
      profiles.map((p) => ({ id: p.id, name: p.name })),
    );
    const activeProfile = profiles[0];

    console.log("6. Running AI Investment Committee Evaluation...");
    const committeeRes = await post(
      "/api/committee/evaluate",
      {
        workspaceId: activeWorkspace.id,
        investorProfileId: activeProfile.id,
        underwritingResult: underwriteRes,
      },
      token,
    );
    console.log("✓ AI Committee Verdict Success:", committeeRes);
    console.log("\n==========================================");
    console.log("ALL API INTEGRATION TESTS PASSED!");
    console.log("==========================================");
  } catch (err) {
    console.error("❌ Test Failed:", err);
  }
}

runTests();
