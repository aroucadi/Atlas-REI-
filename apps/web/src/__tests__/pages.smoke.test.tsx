/**
 * Smoke tests for critical dashboard pages.
 *
 * These tests verify that each page renders without crashing when given
 * minimal mocked context. They exist to catch structural regressions like
 * the React hook-order violation (useState after early return) that broke
 * layout.tsx.
 *
 * NOTE: These do NOT test API integration or full user flows.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// Mock next/navigation since we're outside Next.js runtime
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => "/home",
  useParams: () => ({}),
}));

// Mock the API module
vi.mock("../lib/api", () => ({
  api: {
    me: vi.fn().mockResolvedValue(null),
    getWorkspaces: vi.fn().mockResolvedValue([]),
    getProfiles: vi.fn().mockResolvedValue([]),
    getPortfolios: vi.fn().mockResolvedValue([]),
    getPositions: vi.fn().mockResolvedValue([]),
    getEvents: vi.fn().mockResolvedValue([]),
    getDocuments: vi.fn().mockResolvedValue([]),
    getEvidence: vi.fn().mockResolvedValue([]),
    getDailyBrief: vi.fn().mockResolvedValue(null),
    generateDailyBrief: vi.fn().mockResolvedValue(null),
    getShortlists: vi.fn().mockResolvedValue([]),
    searchDeals: vi.fn().mockResolvedValue([]),
    underwrite: vi.fn().mockResolvedValue({}),
    evaluate: vi.fn().mockResolvedValue({}),
    updateProfile: vi.fn().mockResolvedValue({}),
    uploadDocument: vi.fn().mockResolvedValue({}),
    createShortlist: vi.fn().mockResolvedValue({}),
    addToShortlist: vi.fn().mockResolvedValue({}),
    getAgentAnalytics: vi.fn().mockResolvedValue({
      totalRuns: 0,
      completionRate: 0,
      averageLatencyMs: 0,
      cumulativeCost: 0,
      failureHotspots: [],
    }),
    getAgentDefinitions: vi.fn().mockResolvedValue([]),
    getToolDefinitions: vi.fn().mockResolvedValue([]),
    getJobs: vi.fn().mockResolvedValue([]),
    togglePolicy: vi.fn().mockResolvedValue({ success: true }),
  },
}));

// Mock the TerminalContext
const mockContextValue = {
  user: {
    id: "test-user",
    fullName: "Test User",
    memberships: [{ organizationId: "org-1" }],
  },
  workspaces: [{ id: "ws-1", name: "Test Workspace" }],
  activeWorkspace: { id: "ws-1", name: "Test Workspace" },
  setActiveWorkspace: vi.fn(),
  profiles: [
    {
      id: "profile-1",
      profileName: "Test Profile",
      baseCurrency: "AED",
      capitalAvailable: 1000000,
      targetCountriesJson: ["AE"],
    },
  ],
  activeProfile: {
    id: "profile-1",
    profileName: "Test Profile",
    baseCurrency: "AED",
    capitalAvailable: 1000000,
    targetCountriesJson: ["AE"],
  },
  setActiveProfile: vi.fn(),
  defaultPropertyId: null,
  loading: false,
  refreshProfiles: vi.fn().mockResolvedValue(undefined),
  refreshWorkspaces: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn().mockResolvedValue(undefined),
};

vi.mock("../context/TerminalContext", () => ({
  useTerminal: () => mockContextValue,
  TerminalProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

// Mock lucide-react icons to avoid SVG rendering issues in jsdom
vi.mock("lucide-react", async (importOriginal) => {
  const actual: Record<string, any> = await importOriginal();
  const mocked: Record<string, any> = {};
  for (const key of Object.keys(actual)) {
    if (typeof actual[key] === "function" && key[0] === key[0].toUpperCase()) {
      // Replace icon components with simple spans
      mocked[key] = (props: any) =>
        React.createElement("span", { "data-testid": `icon-${key}`, ...props });
    } else {
      mocked[key] = actual[key];
    }
  }
  return mocked;
});

// Mock the NoDocuments component
vi.mock("../components/visuals/NoDocuments", () => ({
  default: () => React.createElement("div", null, "No documents found"),
}));

// Mock react-pdf since jsdom does not support Canvas/PDF rendering APIs (like DOMMatrix)
vi.mock("react-pdf", () => ({
  Document: ({ children }: any) => React.createElement("div", { "data-testid": "mock-pdf-document" }, children),
  Page: () => React.createElement("div", { "data-testid": "mock-pdf-page" }),
  pdfjs: {
    GlobalWorkerOptions: {
      workerSrc: "",
    },
    version: "0.0.0",
  },
}));

describe("Dashboard Pages — Smoke Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("AdminPage renders operational dashboard", async () => {
    const AdminPage = (await import("../app/(dashboard)/admin/page")).default;
    render(<AdminPage />);
    await screen.findByText(/Agent Operations Control Center/i);
  });

  it("MarketsPage renders offline message", async () => {
    const MarketsPage = (await import("../app/(dashboard)/markets/page"))
      .default;
    render(<MarketsPage />);
    expect(screen.getByText(/Module Offline/i)).toBeInTheDocument();
  });

  it("HomePage renders without crashing", async () => {
    const HomePage = (await import("../app/(dashboard)/home/page")).default;
    render(<HomePage />);
    expect(screen.getByText("INVESTOR TERMINAL")).toBeInTheDocument();
    await screen.findByText(/No workspace intelligence summary available/i);
  });

  it("DocumentsPage renders without crashing", async () => {
    const DocumentsPage = (await import("../app/(dashboard)/documents/page"))
      .default;
    render(<DocumentsPage />);
    await screen.findByText("DOCUMENT MANAGER");
  });

  it("PortfolioPage renders without crashing", async () => {
    const PortfolioPage = (await import("../app/(dashboard)/portfolio/page"))
      .default;
    render(<PortfolioPage />);
    await screen.findByText("Portfolio OS is Empty");
  });
});
