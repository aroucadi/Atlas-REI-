export interface UnderwritePayload {
  workspaceId: string;
  propertyId?: string;
  countryCode: string;
  currency: string;
  purchasePrice: number;
  grossRentalIncomeAnnual: number;
  serviceChargeValue: number;
  serviceChargeUnit: string;
  interiorAreaSqm: number;
  isOffPlan?: boolean;
  useFinancing?: boolean;
  downPaymentPct?: number;
  interestRate?: number;
  termMonths?: number;
}

export interface EvaluatePayload {
  workspaceId: string;
  investorProfileId: string;
  underwriteRunId: string;
}

export const api = {
  async me() {
    const res = await fetch("/api/me");
    if (!res.ok) throw new Error("Unauthorized");
    return res.json();
  },

  async login(email: string, passwordString: string) {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, passwordString }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Login failed");
    return data;
  },

  async register(email: string, fullName: string, passwordString: string) {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, fullName, passwordString }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Registration failed");
    return data;
  },

  async logout() {
    const res = await fetch("/api/auth/logout", { method: "POST" });
    if (!res.ok) throw new Error("Logout failed");
    return res.json();
  },

  async getWorkspaces() {
    const res = await fetch("/api/workspaces");
    if (!res.ok) throw new Error("Failed to fetch workspaces");
    return res.json();
  },

  async createWorkspace(organizationId: string, name: string) {
    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        name,
        workspaceType: "investment",
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to create workspace");
    return data;
  },

  async getProfiles(workspaceId: string) {
    const res = await fetch(`/api/workspaces/${workspaceId}/profiles`);
    if (!res.ok) throw new Error("Failed to fetch profiles");
    return res.json();
  },

  async createProfile(workspaceId: string, payload: any) {
    const res = await fetch(`/api/workspaces/${workspaceId}/profiles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to create profile");
    return data;
  },

  async updateProfile(workspaceId: string, profileId: string, payload: any) {
    const res = await fetch(
      `/api/workspaces/${workspaceId}/profiles/${profileId}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to update profile");
    return data;
  },

  async underwrite(payload: UnderwritePayload) {
    const body: any = {
      workspaceId: payload.workspaceId,
      propertyId: payload.propertyId,
      countryCode: payload.countryCode,
      currency: payload.currency,
      purchasePrice: payload.purchasePrice,
      grossRentalIncomeAnnual: payload.grossRentalIncomeAnnual,
      serviceChargeValue: payload.serviceChargeValue,
      serviceChargeUnit: payload.serviceChargeUnit,
      interiorAreaSqm: payload.interiorAreaSqm,
      isOffPlan: payload.isOffPlan,
    };

    if (payload.useFinancing) {
      body.financing = {
        downPaymentPct: payload.downPaymentPct,
        interestRate: payload.interestRate,
        termMonths: payload.termMonths,
      };
    }

    const res = await fetch(
      `/api/workspaces/${payload.workspaceId}/underwrite`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const data = await res.json();
    if (!res.ok) {
      throw new Error(
        Array.isArray(data.message)
          ? data.message
              .map((m: any) => m.message || JSON.stringify(m))
              .join(", ")
          : data.message || "Underwriting failed",
      );
    }
    return data;
  },

  async evaluate(payload: EvaluatePayload) {
    const { workspaceId, investorProfileId, underwriteRunId } = payload;
    const res = await fetch(
      `/api/workspaces/${workspaceId}/committee/evaluate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ investorProfileId, underwriteRunId }),
      },
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Evaluation failed");
    return data;
  },

  async getCommitteeRun(workspaceId: string, runId: string) {
    const res = await fetch(
      `/api/workspaces/${workspaceId}/committee/runs/${runId}`,
    );
    if (!res.ok) throw new Error("Failed to fetch committee run");
    return res.json();
  },

  async getEvents() {
    const res = await fetch("/api/events");
    if (!res.ok) throw new Error("Failed to fetch events");
    return res.json();
  },

  async getPortfolios(workspaceId: string) {
    const res = await fetch(`/api/workspaces/${workspaceId}/portfolios`);
    if (!res.ok) throw new Error("Failed to fetch portfolios");
    return res.json();
  },

  async getDocuments(workspaceId: string) {
    const res = await fetch(`/api/workspaces/${workspaceId}/documents`);
    if (!res.ok) throw new Error("Failed to fetch documents");
    return res.json();
  },

  async uploadDocument(workspaceId: string, body: any) {
    const res = await fetch(`/api/workspaces/${workspaceId}/documents/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Upload failed");
    return data;
  },

  async getEvidence(workspaceId: string, propertyId?: string) {
    const query = propertyId ? `?propertyId=${propertyId}` : "";
    const res = await fetch(`/api/workspaces/${workspaceId}/evidence${query}`);
    if (!res.ok) throw new Error("Failed to fetch evidence");
    return res.json();
  },

  async getDailyBrief(workspaceId: string) {
    const res = await fetch(`/api/workspaces/${workspaceId}/daily-brief`);
    if (!res.ok) throw new Error("Failed to fetch daily brief");
    return res.json();
  },

  async generateDailyBrief(workspaceId: string) {
    const res = await fetch(
      `/api/workspaces/${workspaceId}/daily-brief/generate`,
      {
        method: "POST",
      },
    );
    if (!res.ok) throw new Error("Failed to generate daily brief");
    return res.json();
  },

  async copilotChat(
    workspaceId: string,
    payload: {
      message: string;
      investorProfileId?: string | null;
      propertyId?: string | null;
      underwriteRunId?: string | null;
    },
  ) {
    const res = await fetch(`/api/workspaces/${workspaceId}/copilot/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Copilot query failed");
    return data;
  },

  async searchDeals(workspaceId: string, investorProfileId?: string) {
    const res = await fetch(
      `/api/workspaces/${workspaceId}/deal-finder/search`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ investorProfileId }),
      },
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Search failed");
    return data;
  },

  async getShortlists(workspaceId: string) {
    const res = await fetch(`/api/workspaces/${workspaceId}/shortlists`);
    if (!res.ok) throw new Error("Failed to fetch shortlists");
    return res.json();
  },

  async createShortlist(workspaceId: string, payload: any) {
    const res = await fetch(`/api/workspaces/${workspaceId}/shortlists`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to create shortlist");
    return data;
  },

  async addShortlistItem(
    workspaceId: string,
    shortlistId: string,
    payload: any,
  ) {
    const res = await fetch(
      `/api/workspaces/${workspaceId}/shortlists/${shortlistId}/items`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to add item");
    return data;
  },

  async removeShortlistItem(
    workspaceId: string,
    shortlistId: string,
    itemId: string,
  ) {
    const res = await fetch(
      `/api/workspaces/${workspaceId}/shortlists/${shortlistId}/items/${itemId}`,
      {
        method: "DELETE",
      },
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to remove item");
    return data;
  },

  async generateMemo(workspaceId: string, propertyId: string) {
    const res = await fetch(
      `/api/workspaces/${workspaceId}/agents/memo/generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId }),
      },
    );
    const data = await res.json();
    if (!res.ok)
      throw new Error(data.message || "Failed to trigger memo agent");
    return data;
  },

  async getJobs(workspaceId: string) {
    const res = await fetch(`/api/workspaces/${workspaceId}/jobs`);
    if (!res.ok) throw new Error("Failed to fetch jobs history");
    return res.json();
  },

  async getJob(workspaceId: string, jobId: string) {
    const res = await fetch(`/api/workspaces/${workspaceId}/jobs/${jobId}`);
    if (!res.ok) throw new Error(`Failed to fetch job details for ${jobId}`);
    return res.json();
  },

  async approveMemo(workspaceId: string, jobId: string) {
    const res = await fetch(
      `/api/workspaces/${workspaceId}/jobs/${jobId}/approve`,
      {
        method: "POST",
      },
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to approve memo");
    return data;
  },

  async rejectMemo(workspaceId: string, jobId: string) {
    const res = await fetch(
      `/api/workspaces/${workspaceId}/jobs/${jobId}/reject`,
      {
        method: "POST",
      },
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to reject memo");
    return data;
  },

  async triggerWorkflow(
    workspaceId: string,
    propertyId: string,
    investorProfileId: string,
  ) {
    const res = await fetch(
      `/api/workspaces/${workspaceId}/agents/workflow/trigger`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, investorProfileId }),
      },
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to trigger workflow");
    return data;
  },

  async approveScreening(workspaceId: string, jobId: string) {
    const res = await fetch(
      `/api/workspaces/${workspaceId}/jobs/${jobId}/approve-screening`,
      {
        method: "POST",
      },
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to approve screening");
    return data;
  },

  async rejectScreening(workspaceId: string, jobId: string) {
    const res = await fetch(
      `/api/workspaces/${workspaceId}/jobs/${jobId}/reject-screening`,
      {
        method: "POST",
      },
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to reject screening");
    return data;
  },

  async approveWorkflowMemo(workspaceId: string, jobId: string) {
    const res = await fetch(
      `/api/workspaces/${workspaceId}/jobs/${jobId}/approve-memo`,
      {
        method: "POST",
      },
    );
    const data = await res.json();
    if (!res.ok)
      throw new Error(data.message || "Failed to approve workflow memo");
    return data;
  },

  async rejectWorkflowMemo(workspaceId: string, jobId: string) {
    const res = await fetch(
      `/api/workspaces/${workspaceId}/jobs/${jobId}/reject-memo`,
      {
        method: "POST",
      },
    );
    const data = await res.json();
    if (!res.ok)
      throw new Error(data.message || "Failed to reject workflow memo");
    return data;
  },

  async getAgentAnalytics(workspaceId: string) {
    const res = await fetch(`/api/workspaces/${workspaceId}/agents/analytics`);
    if (!res.ok) throw new Error("Failed to fetch agent analytics");
    return res.json();
  },

  async getAgentDefinitions(workspaceId: string) {
    const res = await fetch(
      `/api/workspaces/${workspaceId}/agents/definitions`,
    );
    if (!res.ok) throw new Error("Failed to fetch agent definitions");
    return res.json();
  },

  async getToolDefinitions(workspaceId: string) {
    const res = await fetch(`/api/workspaces/${workspaceId}/agents/tools`);
    if (!res.ok) throw new Error("Failed to fetch tool definitions");
    return res.json();
  },

  async togglePolicy(workspaceId: string, payload: any) {
    const res = await fetch(
      `/api/workspaces/${workspaceId}/agents/policy/toggle`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const data = await res.json();
    if (!res.ok)
      throw new Error(data.message || "Failed to update workspace policy");
    return data;
  },

  async compileGoal(workspaceId: string, goalText: string) {
    const res = await fetch(`/api/workspaces/${workspaceId}/goals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goalText }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to compile goal");
    return data;
  },

  async getGoal(workspaceId: string, goalId: string) {
    const res = await fetch(`/api/workspaces/${workspaceId}/goals/${goalId}`);
    if (!res.ok) throw new Error(`Failed to fetch goal details for ${goalId}`);
    return res.json();
  },

  async getAgentMessages(workspaceId: string, goalId: string) {
    const res = await fetch(`/api/workspaces/${workspaceId}/agent-messages/goals/${goalId}`);
    if (!res.ok) throw new Error("Failed to fetch agent messages");
    return res.json();
  },

  async runNegotiation(workspaceId: string, payload: { goalId: string; propertyId: string; initialYield: number }) {
    const res = await fetch(`/api/workspaces/${workspaceId}/agent-messages/negotiate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to execute agent negotiation");
    return data;
  },
};

