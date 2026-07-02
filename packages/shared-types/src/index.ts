import { z } from "zod";

export const CreateOrganizationSchema = z.object({
  name: z.string().min(1, "Organization name must be at least 1 character"),
  slug: z
    .string()
    .min(1, "Slug must be at least 1 character")
    .regex(
      /^[a-z0-9-]+$/,
      "Slug must only contain lowercase letters, numbers, and hyphens",
    ),
  planTier: z
    .enum(["starter", "professional", "enterprise"])
    .default("starter"),
  defaultCurrency: z.string().length(3).default("USD"),
});

export type CreateOrganizationInput = z.infer<typeof CreateOrganizationSchema>;

export const CreateWorkspaceSchema = z.object({
  organizationId: z.string().uuid("Invalid Organization ID"),
  name: z.string().min(1, "Workspace name is required"),
  workspaceType: z
    .enum(["investment", "advisory", "enterprise"])
    .default("investment"),
});

export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceSchema>;

export const RiskToleranceSchema = z.enum([
  "conservative",
  "moderate",
  "aggressive",
]);
export const PreferenceSchema = z.enum(["income", "growth", "balanced"]);
export const FinancingPreferenceSchema = z.enum([
  "cash",
  "mortgage",
  "flexible",
]);
export const VerdictSchema = z.enum(["Strong Buy", "Buy", "Wait", "Avoid"]);

export const InvestorProfileSchema = z.object({
  name: z.string().min(1, "Profile name is required"),
  baseCurrency: z.string().length(3).default("AED"),
  capitalAvailable: z
    .number()
    .positive("Capital available must be greater than 0"),
  riskTolerance: RiskToleranceSchema,
  investmentHorizonMonths: z
    .number()
    .int()
    .positive("Investment horizon must be positive"),
  incomeVsGrowthPreference: PreferenceSchema,
  financingPreference: FinancingPreferenceSchema,
  targetCountries: z
    .array(z.string().length(2))
    .min(1, "At least one target country is required"),
  constraints: z.record(z.any()).default({}),
  goals: z.record(z.any()).default({}),
});

export type InvestorProfileInput = z.infer<typeof InvestorProfileSchema>;

export const UnderwritePropertyInputSchema = z.object({
  workspaceId: z.string().uuid(),
  propertyId: z.string().uuid().optional().nullable(),
  countryCode: z.string().length(2),
  currency: z.string().length(3),
  purchasePrice: z.number().positive(),
  grossRentalIncomeAnnual: z.number().nonnegative(),
  serviceChargeValue: z.number().optional(),
  serviceChargeUnit: z
    .enum([
      "per_sqm_annual",
      "per_sqft_annual",
      "per_sqm_monthly",
      "per_sqft_monthly",
    ])
    .default("per_sqm_annual"),
  serviceChargePerSqm: z.number().optional(), // kept for backward compatibility
  interiorAreaSqm: z.number().optional(),
  isOffPlan: z.boolean().optional(),
  financing: z
    .object({
      downPaymentPct: z.number().min(0).max(1),
      interestRate: z.number().min(0).max(1),
      termMonths: z.number().int().positive(),
    })
    .optional(),
});

export type UnderwritePropertyInput = z.infer<
  typeof UnderwritePropertyInputSchema
>;

export const RegisterRequestSchema = z.object({
  email: z.string().email("Invalid email address"),
  fullName: z.string().min(1, "Full name is required"),
  passwordString: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
});

export type RegisterRequestInput = z.infer<typeof RegisterRequestSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().email("Invalid email address"),
  passwordString: z.string().min(1, "Password is required"),
});

export type LoginRequestInput = z.infer<typeof LoginRequestSchema>;

export const CommitteeEvaluateRequestSchema = z.object({
  workspaceId: z.string().uuid("Invalid Workspace ID"),
  investorProfileId: z.string().uuid("Invalid Investor Profile ID"),
  underwriteRunId: z.string().uuid("Invalid Underwrite Run ID"),
});

export type CommitteeEvaluateRequestInput = z.infer<
  typeof CommitteeEvaluateRequestSchema
>;

export const GroundedClaimSchema = z.object({
  statement: z.string(),
  isSupported: z.boolean(),
  evidenceId: z.string().uuid().optional().nullable(),
  confidence: z.number().min(0).max(1).optional().nullable(),
  freshness: z.string().or(z.date()).optional().nullable(),
  source: z.string().optional().nullable(),
});

export const CommitteeEvaluationResultSchema = z.object({
  verdict: VerdictSchema,
  confidenceScore: z.number().min(0).max(1),
  thesisSummary: z.string().min(1, "Thesis summary is required"),
  objectionsSummary: z.string().min(1, "Objections summary is required"),
  changeConditionsSummary: z
    .string()
    .min(1, "Change conditions summary is required"),
  thesisClaims: z.array(GroundedClaimSchema),
  objectionsClaims: z.array(GroundedClaimSchema),
  changeConditionsClaims: z.array(GroundedClaimSchema),
});

export type CommitteeEvaluationResult = z.infer<
  typeof CommitteeEvaluationResultSchema
>;

export const CreatePortfolioSchema = z.object({
  name: z.string().min(1, "Portfolio name is required"),
  baseCurrency: z.string().length(3).default("AED"),
  portfolioType: z
    .enum(["personal", "syndicate", "advisory", "core"])
    .default("personal"),
});

export type CreatePortfolioInput = z.infer<typeof CreatePortfolioSchema>;

export const AddFinancingSchema = z.object({
  lenderName: z.string().min(1),
  loanType: z.string().min(1),
  principalAmount: z.number().positive(),
  currency: z.string().length(3),
  interestRateType: z.string().min(1),
  interestRateValue: z.number().nonnegative(),
  termMonths: z.number().int().positive(),
});

export const AddPortfolioPositionSchema = z.object({
  propertyId: z.string().uuid().nullable().optional(),
  acquisitionDate: z
    .string()
    .or(z.date())
    .transform((val) => new Date(val)),
  acquisitionPrice: z.number().positive(),
  acquisitionCurrency: z.string().length(3),
  ownershipSharePct: z.number().min(0).max(100).default(100.0),
  notes: z.string().optional(),
  status: z.enum(["active", "sold", "pending"]).default("active"),
  financing: AddFinancingSchema.optional(),
});

export type AddPortfolioPositionInput = z.infer<
  typeof AddPortfolioPositionSchema
>;

export const UploadDocumentSchema = z.object({
  fileName: z.string().min(1),
  entityType: z.string().default("property"),
  entityId: z.string().uuid().optional().or(z.literal("")),
  documentType: z.string().default("lease_agreement"),
  mimeType: z.string().optional(),
  fileBase64: z.string().optional(),
});

export type UploadDocumentInput = z.infer<typeof UploadDocumentSchema>;

export const CreateShortlistSchema = z.object({
  name: z.string().min(1, "Shortlist name is required"),
  investorProfileId: z.string().uuid().optional().nullable(),
});

export type CreateShortlistInput = z.infer<typeof CreateShortlistSchema>;

export const AddShortlistItemSchema = z.object({
  entityType: z.enum(["property", "district"]),
  entityId: z.string().min(1, "Entity ID is required"),
  rankPosition: z.number().int().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export type AddShortlistItemInput = z.infer<typeof AddShortlistItemSchema>;

export const DailyBriefSummarySchema = z.object({
  inferredSummary: z.string(),
  bulletPoints: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      evidenceIds: z.array(z.string().uuid()),
    }),
  ),
});

export type DailyBriefSummary = z.infer<typeof DailyBriefSummarySchema>;

export const CopilotChatRequestSchema = z.object({
  message: z.string().min(1, "Message cannot be empty"),
  investorProfileId: z.string().uuid().optional().nullable(),
  propertyId: z.string().uuid().optional().nullable(),
  underwriteRunId: z.string().uuid().optional().nullable(),
});

export type CopilotChatRequestInput = z.infer<typeof CopilotChatRequestSchema>;

export const CopilotChatResponseSchema = z.object({
  answer: z.string(),
  toolsUsed: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      args: z.record(z.any()),
      resultSummary: z.string(),
    }),
  ),
  suggestedActions: z
    .array(
      z.object({
        label: z.string(),
        action: z.string(),
      }),
    )
    .default([]),
});

export type CopilotChatResponse = z.infer<typeof CopilotChatResponseSchema>;

export const CreateMemoJobRequestSchema = z.object({
  propertyId: z.string().uuid("Invalid Property ID"),
});

export type CreateMemoJobRequestInput = z.infer<
  typeof CreateMemoJobRequestSchema
>;

export const JobStatusSchema = z.enum([
  "queued",
  "running",
  "blocked",
  "awaiting_approval",
  "completed",
  "failed",
]);

export const LogEntrySchema = z.object({
  timestamp: z.string(),
  message: z.string(),
});

export const AgentMemoResultSchema = z.object({
  memoText: z.string(),
  stepTrace: z.array(z.string()),
  runLogs: z.array(LogEntrySchema),
});

export type AgentMemoResult = z.infer<typeof AgentMemoResultSchema>;

export const CreateWorkflowJobRequestSchema = z.object({
  propertyId: z.string().uuid("Invalid Property ID"),
  investorProfileId: z.string().uuid("Invalid Investor Profile ID"),
});

export type CreateWorkflowJobRequestInput = z.infer<
  typeof CreateWorkflowJobRequestSchema
>;

export const AgentScreeningResultSchema = z.object({
  score: z.number().min(0).max(100),
  verdict: z.enum(["Pass", "Fail", "Avoid"]),
  thesis: z.string(),
});

export type AgentScreeningResult = z.infer<typeof AgentScreeningResultSchema>;

export const AgentDiligenceResultSchema = z.object({
  riskLevel: z.enum(["low", "medium", "high"]),
  verifiedLeasesCount: z.number().nonnegative(),
  issues: z.array(z.string()),
  text: z.string(),
});

export type AgentDiligenceResult = z.infer<typeof AgentDiligenceResultSchema>;

export const AgentWorkflowResultSchema = z.object({
  propertyId: z.string().uuid(),
  investorProfileId: z.string().uuid(),
  step: z.enum(["screening", "diligence", "memo"]),
  screeningResult: AgentScreeningResultSchema.optional().nullable(),
  diligenceResult: AgentDiligenceResultSchema.optional().nullable(),
  memoResult: z.object({ memoText: z.string() }).optional().nullable(),
  stepTrace: z.array(z.string()),
  runLogs: z.array(LogEntrySchema),
});

export type AgentWorkflowResult = z.infer<typeof AgentWorkflowResultSchema>;

export const AgentAnalyticsResponseSchema = z.object({
  totalRuns: z.number(),
  completionRate: z.number(),
  averageLatencyMs: z.number(),
  cumulativeCost: z.number(),
  failureHotspots: z.array(
    z.object({
      step: z.string(),
      count: z.number(),
      errorMessage: z.string(),
    }),
  ),
});

export type AgentAnalyticsResponse = z.infer<
  typeof AgentAnalyticsResponseSchema
>;

export const TogglePolicyRequestSchema = z.object({
  requireScreeningApproval: z.boolean().optional(),
  requireMemoApproval: z.boolean().optional(),
  watchlistCheckIntervalSeconds: z.number().int().positive().optional(),
});

export type TogglePolicyRequest = z.infer<typeof TogglePolicyRequestSchema>;

export const CopilotRoutingSchema = z.object({
  toolName: z.enum([
    "summarize_deal",
    "explain_verdict",
    "compare_opportunities",
    "explain_portfolio_risk",
    "summarize_events",
    "recommend_next_steps",
    "query_documents",
    "none",
  ]),
  args: z
    .object({
      propertyId: z.string().uuid().nullable().optional(),
      underwriteRunId: z.string().uuid().nullable().optional(),
    })
    .default({}),
});

export type CopilotRouting = z.infer<typeof CopilotRoutingSchema>;

