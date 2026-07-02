import { Injectable } from '@nestjs/common';
import { AgentMessageBrokerService } from './agent-message-broker.service';
import { AiGateway } from '@atlas/ai-gateway';
import { z } from 'zod';

const CriticVerdictSchema = z.object({
  verdict: z.enum(['ACCEPT', 'REJECT']),
  feedback: z.string(),
});

const UnderwriterAdjustmentSchema = z.object({
  adjustedYield: z.number(),
  rationale: z.string(),
});

@Injectable()
export class ConsensusCoordinatorService {
  private readonly MAX_HOPS = 5;
  private readonly aiGateway = new AiGateway();

  constructor(private readonly messageBroker: AgentMessageBrokerService) {}

  async runNegotiation(
    workspaceId: string,
    goalId: string,
    propertyId: string,
    initialYield: number,
  ): Promise<{
    status: 'consensus' | 'deadlock';
    finalYield?: number;
    messagesCount: number;
  }> {
    let currentYield = initialYield;
    let hops = 0;
    let consensusReached = false;

    if (this.aiGateway.isSimulationMode()) {
      // Send initial proposal from Underwriter
      await this.messageBroker.sendMessage(
        workspaceId,
        goalId,
        'UnderwriterAgent',
        'CriticAgent',
        'PROPOSE',
        { yield: currentYield, propertyId },
      );

      while (hops < this.MAX_HOPS && !consensusReached) {
        hops++;

        // Evaluate the proposed yield from the perspective of the Critic
        if (currentYield > 8.5) {
          // Critic rejects the high yield
          await this.messageBroker.sendMessage(
            workspaceId,
            goalId,
            'CriticAgent',
            'UnderwriterAgent',
            'CRITICIZE',
            {
              feedback: `Proposed yield of ${currentYield}% is too high. Comps suggest a max yield of 8.5%. Please lower assumptions.`,
              propertyId,
            },
          );

          // Underwriter processes the criticism and adjusts downward
          currentYield = +(currentYield - 0.8).toFixed(2);

          await this.messageBroker.sendMessage(
            workspaceId,
            goalId,
            'UnderwriterAgent',
            'CriticAgent',
            'PROPOSE',
            { yield: currentYield, propertyId },
          );
        } else {
          // Critic accepts the yield
          await this.messageBroker.sendMessage(
            workspaceId,
            goalId,
            'CriticAgent',
            'UnderwriterAgent',
            'ACCEPT',
            {
              message: `Yield proposal of ${currentYield}% is within acceptable parameters.`,
              propertyId,
            },
          );
          consensusReached = true;
        }
      }
    } else {
      // Send initial proposal from Underwriter
      await this.messageBroker.sendMessage(
        workspaceId,
        goalId,
        'UnderwriterAgent',
        'CriticAgent',
        'PROPOSE',
        { yield: currentYield, propertyId },
      );

      while (hops < this.MAX_HOPS && !consensusReached) {
        hops++;

        // Ask the Critic Agent if the yield is acceptable
        const criticPrompt = `
        You are the Critic Agent representing the Investment Committee.
        Workspace: ${workspaceId}
        Goal: ${goalId}
        Property: ${propertyId}
        Proposed Yield: ${currentYield}%

        Evaluate if this yield is acceptable. Standard micro-market comps indicate yields above 8.5% are unrealistic and likely based on inflated rental growth assumptions.
        Determine if you ACCEPT or REJECT this proposal. If you reject, provide detailed criticism explaining why and recommending a lower yield range.

        Return a JSON matching the CriticVerdict schema.
        `;

        let criticDecision;
        try {
          criticDecision = await this.aiGateway.generateStructuredJson<
            z.infer<typeof CriticVerdictSchema>
          >(
            criticPrompt,
            CriticVerdictSchema,
            'You are a conservative real estate risk analyst.',
          );
        } catch {
          // fallback to simulation logic
          criticDecision = {
            verdict:
              currentYield > 8.5 ? ('REJECT' as const) : ('ACCEPT' as const),
            feedback:
              'Model generation failed. Falling back to default comp rule.',
          };
        }

        if (criticDecision.verdict === 'REJECT') {
          await this.messageBroker.sendMessage(
            workspaceId,
            goalId,
            'CriticAgent',
            'UnderwriterAgent',
            'CRITICIZE',
            {
              feedback: criticDecision.feedback,
              propertyId,
            },
          );

          // Underwriter processes criticism and proposes adjustment
          const underwriterPrompt = `
          You are the Underwriter Agent.
          Workspace: ${workspaceId}
          Goal: ${goalId}
          Property: ${propertyId}
          Current Yield: ${currentYield}%

          The Critic Agent has rejected your proposal with the following feedback:
          "${criticDecision.feedback}"

          Please adjust your yield assumptions downward based on the feedback. Propose a new revised yield.
          
          Return a JSON matching the UnderwriterAdjustment schema.
          `;

          let underwriterAdjustment;
          try {
            underwriterAdjustment = await this.aiGateway.generateStructuredJson<
              z.infer<typeof UnderwriterAdjustmentSchema>
            >(
              underwriterPrompt,
              UnderwriterAdjustmentSchema,
              'You are a data-driven underwriting analyst seeking realistic consensus.',
            );
          } catch {
            // fallback
            underwriterAdjustment = {
              adjustedYield: +(currentYield - 0.8).toFixed(2),
              rationale: 'Fallback adjustment.',
            };
          }

          currentYield = underwriterAdjustment.adjustedYield;

          await this.messageBroker.sendMessage(
            workspaceId,
            goalId,
            'UnderwriterAgent',
            'CriticAgent',
            'PROPOSE',
            { yield: currentYield, propertyId },
          );
        } else {
          await this.messageBroker.sendMessage(
            workspaceId,
            goalId,
            'CriticAgent',
            'UnderwriterAgent',
            'ACCEPT',
            {
              message: criticDecision.feedback || 'Yield proposal accepted.',
              propertyId,
            },
          );
          consensusReached = true;
        }
      }
    }

    if (consensusReached) {
      return {
        status: 'consensus',
        finalYield: currentYield,
        messagesCount: hops * 2, // approximation of hops
      };
    }

    return {
      status: 'deadlock',
      messagesCount: hops * 2,
    };
  }
}
