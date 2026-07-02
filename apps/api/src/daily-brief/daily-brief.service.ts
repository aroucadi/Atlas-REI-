import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { EvidenceService } from '../evidence/evidence.service';
import { AiGateway } from '@atlas/ai-gateway';
import { DailyBriefSummarySchema } from '@atlas/shared-types';

@Injectable()
export class DailyBriefService {
  private readonly aiGateway: AiGateway;

  constructor(
    private readonly db: DatabaseService,
    private readonly evidenceService: EvidenceService,
  ) {
    this.aiGateway = new AiGateway();
  }

  async getDailyBrief(workspaceId: string) {
    return this.db.client.dailyBrief.findFirst({
      where: { workspaceId },
      orderBy: {
        briefDate: 'desc',
      },
    });
  }

  async generateDailyBrief(workspaceId: string) {
    // 1. Fetch all evidence for workspace
    const evidenceList =
      await this.evidenceService.getEvidenceForWorkspace(workspaceId);

    // 2. Fetch macroeconomic events
    const events = await this.db.client.event.findMany({
      include: {
        eventSource: true,
        impacts: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
    });

    // 3. Format context
    let contextStr = 'EVIDENCE LEDGER:\n';
    if (evidenceList.length === 0) {
      contextStr += '- No workspace-specific evidence found.\n';
    } else {
      evidenceList.forEach((ev, idx) => {
        contextStr += `${idx + 1}. [ID: ${ev.id}] Title: ${ev.title}, SourceType: ${ev.sourceType}, Freshness: ${ev.freshness.toISOString()}, Confidence: ${ev.confidence || 'N/A'}\n`;
        if (ev.snippet) {
          contextStr += `   Snippet: ${ev.snippet}\n`;
        }
      });
    }

    contextStr += '\nGLOBAL MARKET GEOPOLITICAL EVENTS:\n';
    if (events.length === 0) {
      contextStr += '- No macroeconomic events cataloged.\n';
    } else {
      events.forEach((ev, idx) => {
        contextStr += `${idx + 1}. Title: ${ev.title}, Severity: ${ev.severity}, Summary: ${ev.summary}, Confidence: ${ev.confidence}\n`;
        ev.impacts?.forEach((imp: any) => {
          contextStr += `   - Impact on ${imp.entityId} (${imp.impactDomain}): ${imp.impactDirection} (${imp.impactMagnitude})\n`;
        });
      });
    }

    const systemInstruction = `You are the Lead Investment Intelligence Analyst for Atlas REI.
Your task is to synthesize the provided workspace evidence and global macroeconomic signals into a structured Daily Brief summary.
You MUST output a JSON object matching the required schema:
{
  "inferredSummary": "string",
  "bulletPoints": [
    {
      "title": "string",
      "description": "string",
      "evidenceIds": ["uuid"]
    }
  ]
}
Guidance:
1. "inferredSummary" should be a high-quality 2-3 sentence overview of the workspace situation and general market outlook.
2. "bulletPoints" should highlight specific critical items.
3. Every bullet point MUST link to relevant evidence by including the exact evidenceId(s) in "evidenceIds" if any matches from the workspace evidence ledger. If a bullet point is solely based on macroeconomic signals without matching workspace evidence, leave "evidenceIds" empty.
4. Do not make up evidenceIds. Only use valid UUIDs from the provided context.`;

    const prompt = `Generate a grounded daily brief summary based on the following context:\n\n${contextStr}`;

    const briefSummary = await this.aiGateway.generateStructuredJson<any>(
      prompt,
      DailyBriefSummarySchema,
      systemInstruction,
    );

    const briefDate = new Date();
    briefDate.setHours(0, 0, 0, 0);

    const brief = await this.db.client.dailyBrief.upsert({
      where: {
        workspaceId_briefDate: {
          workspaceId,
          briefDate,
        },
      },
      update: {
        summaryJson: briefSummary,
      },
      create: {
        workspaceId,
        briefDate,
        summaryJson: briefSummary,
      },
    });

    return brief;
  }
}
