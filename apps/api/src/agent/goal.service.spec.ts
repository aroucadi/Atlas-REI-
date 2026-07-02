import { GoalService } from './goal.service';
import { BadRequestException } from '@nestjs/common';

describe('GoalService (Release 13)', () => {
  let service: GoalService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      client: {
        goal: {
          create: jest.fn().mockImplementation(({ data }) => ({
            id: 'goal-123',
            ...data,
          })),
          findFirst: jest.fn(),
          update: jest.fn(),
        },
        objective: {
          create: jest.fn().mockImplementation(({ data }) => ({
            id: 'obj-uuid-1',
            ...data,
          })),
          update: jest.fn(),
          findMany: jest.fn(),
        },
      },
    };
    service = new GoalService(mockDb);
  });

  it('should compile and create a goal and objectives successfully', async () => {
    const goal = await service.compileGoal(
      'ws-123',
      'Screen Downtown Dubai deals',
    );

    expect(goal.id).toBe('goal-123');
    expect(mockDb.client.goal.create).toHaveBeenCalled();
    expect(mockDb.client.objective.create).toHaveBeenCalledTimes(3); // Screen, Diligence, Memo compiled from mock simulation
  });

  it('should block goal compilation if it contains dependency cycles', async () => {
    // Override simulation compilation to create a cycle
    jest.spyOn(service as any, 'simulateGoalCompilation').mockReturnValue({
      title: 'Cyclic Goal',
      description: 'Broken plan',
      objectives: [
        {
          id: 'node-1',
          title: 'First Node',
          dependencies: ['node-2'],
          criteria: {},
        },
        {
          id: 'node-2',
          title: 'Second Node',
          dependencies: ['node-1'],
          criteria: {},
        },
      ],
    });

    await expect(
      service.compileGoal('ws-123', 'Run broken pipeline'),
    ).rejects.toThrow(BadRequestException);
  });

  it('should propagate failed status and block subsequent dependant steps (backtracking)', async () => {
    const mockObjectives = [
      {
        id: 'step-1',
        goalId: 'goal-123',
        title: 'Step 1',
        status: 'FAILED',
        dependencies: [],
      },
      {
        id: 'step-2',
        goalId: 'goal-123',
        title: 'Step 2',
        status: 'PENDING',
        dependencies: ['step-1'],
      },
      {
        id: 'step-3',
        goalId: 'goal-123',
        title: 'Step 3',
        status: 'PENDING',
        dependencies: ['step-2'],
      },
    ];

    mockDb.client.goal.findFirst.mockResolvedValue({
      id: 'goal-123',
      workspaceId: 'ws-123',
    });
    mockDb.client.objective.findMany.mockImplementation(() =>
      Promise.resolve(mockObjectives),
    );
    mockDb.client.objective.update.mockImplementation(
      ({ where, data }: any) => {
        const obj = mockObjectives.find((o) => o.id === where.id);
        if (obj) {
          obj.status = data.status;
        }
        return Promise.resolve(obj);
      },
    );

    await service.updateObjectiveStatus(
      'ws-123',
      'goal-123',
      'step-1',
      'FAILED',
    );

    // Verify step-2 and step-3 are updated to BLOCKED
    expect(mockObjectives.find((o) => o.id === 'step-2')?.status).toBe(
      'BLOCKED',
    );
    expect(mockObjectives.find((o) => o.id === 'step-3')?.status).toBe(
      'BLOCKED',
    );

    // Verify Goal status propagates to FAILED
    expect(mockDb.client.goal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'goal-123' },
        data: { status: 'FAILED' },
      }),
    );
  });
});
