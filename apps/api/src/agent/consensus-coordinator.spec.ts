import { AgentMessageBrokerService } from './agent-message-broker.service';
import { ConsensusCoordinatorService } from './consensus-coordinator.service';
import { BadRequestException } from '@nestjs/common';

describe('Multi-Agent Society & Consensus (Release 15)', () => {
  let broker: AgentMessageBrokerService;
  let coordinator: ConsensusCoordinatorService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      client: {
        goal: {
          findFirst: jest.fn(),
        },
        agentMessage: {
          create: jest.fn().mockImplementation(({ data }) => ({
            id: 'msg-uuid',
            ...data,
            createdAt: new Date(),
          })),
          findMany: jest.fn(),
        },
      },
    };

    broker = new AgentMessageBrokerService(mockDb);
    coordinator = new ConsensusCoordinatorService(broker);
  });

  describe('AgentMessageBrokerService', () => {
    it('should send and persist messages if the goal belongs to the workspace', async () => {
      mockDb.client.goal.findFirst.mockResolvedValue({
        id: 'goal-123',
        workspaceId: 'ws-123',
      });

      const msg = await broker.sendMessage(
        'ws-123',
        'goal-123',
        'UnderwriterAgent',
        'CriticAgent',
        'PROPOSE',
        { yield: 9.0 },
      );

      expect(msg.sender).toBe('UnderwriterAgent');
      expect(msg.recipient).toBe('CriticAgent');
      expect(msg.performative).toBe('PROPOSE');
      expect(msg.content).toEqual({ yield: 9.0 });
      expect(mockDb.client.agentMessage.create).toHaveBeenCalled();
    });

    it('should throw BadRequestException if goal does not exist or workspace tenancy mismatch', async () => {
      mockDb.client.goal.findFirst.mockResolvedValue(null);

      await expect(
        broker.sendMessage(
          'ws-123',
          'goal-wrong-ws',
          'UnderwriterAgent',
          'CriticAgent',
          'PROPOSE',
          { yield: 9.0 },
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockDb.client.agentMessage.create).not.toHaveBeenCalled();
    });
  });

  describe('ConsensusCoordinatorService', () => {
    it('should run negotiation to consensus if proposed yield is eventually acceptable', async () => {
      mockDb.client.goal.findFirst.mockResolvedValue({
        id: 'goal-123',
        workspaceId: 'ws-123',
      });

      // Run negotiation with initial yield 9.5% (which is > 8.5%, so it will trigger rejection -> adjustment -> acceptance)
      const result = await coordinator.runNegotiation(
        'ws-123',
        'goal-123',
        'prop-123',
        9.5,
      );

      expect(result.status).toBe('consensus');
      expect(result.finalYield).toBe(7.9); // 9.5 -> rejected -> 8.7 -> rejected -> 7.9 -> accepted
      expect(result.messagesCount).toBeGreaterThan(0);

      // Verify messages sent include PROPOSE, CRITICIZE, and ACCEPT
      const calls = mockDb.client.agentMessage.create.mock.calls;
      const performatives = calls.map((call: any) => call[0].data.performative);

      expect(performatives).toContain('PROPOSE');
      expect(performatives).toContain('CRITICIZE');
      expect(performatives).toContain('ACCEPT');
    });

    it('should trigger deadlock if loop continues past maximum hops', async () => {
      mockDb.client.goal.findFirst.mockResolvedValue({
        id: 'goal-123',
        workspaceId: 'ws-123',
      });

      // Force a higher initial yield that won't reach <= 8.5 within 5 hops
      const result = await coordinator.runNegotiation(
        'ws-123',
        'goal-123',
        'prop-123',
        15.0,
      );

      expect(result.status).toBe('deadlock');
    });
  });
});
