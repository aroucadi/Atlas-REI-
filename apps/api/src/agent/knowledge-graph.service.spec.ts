import { KnowledgeGraphService } from './knowledge-graph.service';
import { BadRequestException } from '@nestjs/common';

describe('KnowledgeGraphService (Release 14)', () => {
  let service: KnowledgeGraphService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      client: {
        entityNode: {
          upsert: jest.fn(),
          findFirst: jest.fn(),
          findMany: jest.fn(),
          delete: jest.fn(),
        },
        entityRelationship: {
          create: jest.fn(),
          findMany: jest.fn(),
          updateMany: jest.fn(),
          findFirst: jest.fn(),
          update: jest.fn(),
        },
      },
    };
    service = new KnowledgeGraphService(mockDb);
  });

  describe('ingestText', () => {
    it('should upsert nodes and create relationships from text ingestion (simulation)', async () => {
      // Setup mock upsert responses
      mockDb.client.entityNode.upsert
        .mockResolvedValueOnce({
          id: 'node-prop-123',
          name: 'Burj Crown Apartment 402',
          type: 'Property',
        })
        .mockResolvedValueOnce({
          id: 'node-landlord-456',
          name: 'Emaar Properties',
          type: 'Landlord',
        });

      const result = await service.ingestText(
        'workspace-123',
        'Some text for simulation',
      );

      expect(result).toEqual({
        nodesCount: 2,
        relationshipsCount: 1,
      });

      expect(mockDb.client.entityNode.upsert).toHaveBeenCalledTimes(2);
      expect(mockDb.client.entityRelationship.create).toHaveBeenCalledWith({
        data: {
          workspaceId: 'workspace-123',
          sourceNodeId: 'node-prop-123',
          targetNodeId: 'node-landlord-456',
          type: 'OWNED_BY',
          propertiesJson: { since: '2026-01-01' },
        },
      });
    });
  });

  describe('getNeighbors', () => {
    it('should throw BadRequestException if node is not found or from a different workspace', async () => {
      mockDb.client.entityNode.findFirst.mockResolvedValue(null);

      await expect(
        service.getNeighbors('workspace-123', 'node-wrong-ws'),
      ).rejects.toThrow(BadRequestException);

      expect(mockDb.client.entityNode.findFirst).toHaveBeenCalledWith({
        where: { id: 'node-wrong-ws', workspaceId: 'workspace-123' },
      });
    });

    it('should return outgoing and incoming neighbors strictly within the workspace tenancy', async () => {
      const node = {
        id: 'node-1',
        workspaceId: 'workspace-123',
        name: 'Node 1',
        type: 'Property',
      };
      mockDb.client.entityNode.findFirst.mockResolvedValue(node);

      mockDb.client.entityRelationship.findMany
        .mockResolvedValueOnce([
          {
            type: 'OWNED_BY',
            propertiesJson: { shares: 100 },
            targetNode: { id: 'node-2', name: 'Target Node', type: 'Landlord' },
          },
        ]) // Outgoing
        .mockResolvedValueOnce([
          {
            type: 'CITES',
            propertiesJson: {},
            sourceNode: { id: 'node-3', name: 'Source Node', type: 'Document' },
          },
        ]); // Incoming

      const result = await service.getNeighbors('workspace-123', 'node-1');

      expect(result.node).toEqual(node);
      expect(result.outgoing).toHaveLength(1);
      expect(result.outgoing[0]).toEqual({
        relationshipType: 'OWNED_BY',
        target: { id: 'node-2', name: 'Target Node', type: 'Landlord' },
        properties: { shares: 100 },
      });
      expect(result.incoming).toHaveLength(1);
      expect(result.incoming[0]).toEqual({
        relationshipType: 'CITES',
        source: { id: 'node-3', name: 'Source Node', type: 'Document' },
        properties: {},
      });

      // Verify the query criteria ensures tenancy checks
      expect(mockDb.client.entityRelationship.findMany).toHaveBeenNthCalledWith(
        1,
        {
          where: { sourceNodeId: 'node-1', workspaceId: 'workspace-123' },
          include: { targetNode: true },
        },
      );
      expect(mockDb.client.entityRelationship.findMany).toHaveBeenNthCalledWith(
        2,
        {
          where: { targetNodeId: 'node-1', workspaceId: 'workspace-123' },
          include: { sourceNode: true },
        },
      );
    });
  });

  describe('consolidateDuplicates', () => {
    it('should merge case-insensitive duplicates, update relationships, and delete duplicates', async () => {
      const existingNodes = [
        {
          id: 'node-a',
          name: 'Burj Crown',
          type: 'Property',
          workspaceId: 'workspace-123',
        },
        {
          id: 'node-b',
          name: 'burj crown ',
          type: 'Property',
          workspaceId: 'workspace-123',
        },
        {
          id: 'node-c',
          name: 'Other Property',
          type: 'Property',
          workspaceId: 'workspace-123',
        },
      ];

      mockDb.client.entityNode.findMany.mockResolvedValue(existingNodes);

      const result = await service.consolidateDuplicates(
        'workspace-123',
        'Property',
      );

      expect(result).toEqual({ mergedCount: 1 });

      // Verifies updateMany has been called to re-link relationships to node-a
      expect(mockDb.client.entityRelationship.updateMany).toHaveBeenCalledWith({
        where: { sourceNodeId: 'node-b', workspaceId: 'workspace-123' },
        data: { sourceNodeId: 'node-a' },
      });

      expect(mockDb.client.entityRelationship.updateMany).toHaveBeenCalledWith({
        where: { targetNodeId: 'node-b', workspaceId: 'workspace-123' },
        data: { targetNodeId: 'node-a' },
      });

      // Verifies node-b has been deleted
      expect(mockDb.client.entityNode.delete).toHaveBeenCalledWith({
        where: { id: 'node-b' },
      });
      expect(mockDb.client.entityNode.delete).not.toHaveBeenCalledWith({
        where: { id: 'node-c' },
      });
    });
  });
});
