import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AiGateway } from '@atlas/ai-gateway';
import { z } from 'zod';

export const ExtractedNodeSchema = z.object({
  name: z.string(),
  type: z.string(), // Property | Landlord | Comp | MarketEvent | Document
  properties: z.any().default({}),
});

export const ExtractedRelationshipSchema = z.object({
  sourceName: z.string(),
  sourceType: z.string(),
  targetName: z.string(),
  targetType: z.string(),
  type: z.string(), // OWNED_BY | VALUED_AT | CITES | AFFECTS
  properties: z.any().default({}),
});

export const ExtractedGraphSchema = z.object({
  nodes: z.array(ExtractedNodeSchema),
  relationships: z.array(ExtractedRelationshipSchema),
});

export type ExtractedGraph = z.infer<typeof ExtractedGraphSchema>;

@Injectable()
export class KnowledgeGraphService {
  private readonly aiGateway: AiGateway;

  constructor(private readonly db: DatabaseService) {
    this.aiGateway = new AiGateway();
  }

  async ingestText(workspaceId: string, text: string): Promise<any> {
    const isSim = this.aiGateway.isSimulationMode();
    let extracted: ExtractedGraph;

    if (isSim) {
      extracted = this.simulateEntityExtraction(text);
    } else {
      const prompt = `Extract entities and relationships from the following text:
Text: "${text}"

Output a JSON matching the schema containing extracted nodes and their relationships.`;

      const systemInstruction = `You are a Semantic Entity Extractor. Extract entities (Property, Landlord, Comp, MarketEvent, Document) and their relationships (OWNED_BY, VALUED_AT, CITES, AFFECTS).`;

      try {
        extracted = await this.aiGateway.generateStructuredJson<ExtractedGraph>(
          prompt,
          ExtractedGraphSchema,
          systemInstruction,
        );
      } catch (err: any) {
        throw new BadRequestException(
          `Entity extraction failed: ${err.message}`,
        );
      }
    }

    const createdNodesMap = new Map<string, string>();

    // 1. Ingest Nodes
    for (const node of extracted.nodes) {
      const dbNode = await this.db.client.entityNode.upsert({
        where: {
          workspaceId_type_name: {
            workspaceId,
            type: node.type,
            name: node.name.trim(),
          },
        },
        update: {
          propertiesJson: node.properties || {},
        },
        create: {
          workspaceId,
          type: node.type,
          name: node.name.trim(),
          propertiesJson: node.properties || {},
        },
      });
      createdNodesMap.set(
        `${node.type}:${node.name.trim().toLowerCase()}`,
        dbNode.id,
      );
    }

    // 2. Ingest Relationships
    for (const rel of extracted.relationships) {
      const sourceId = createdNodesMap.get(
        `${rel.sourceType}:${rel.sourceName.trim().toLowerCase()}`,
      );
      const targetId = createdNodesMap.get(
        `${rel.targetType}:${rel.targetName.trim().toLowerCase()}`,
      );

      if (sourceId && targetId) {
        const existing = await this.db.client.entityRelationship.findFirst({
          where: {
            workspaceId,
            sourceNodeId: sourceId,
            targetNodeId: targetId,
            type: rel.type,
          },
        });

        if (!existing) {
          await this.db.client.entityRelationship.create({
            data: {
              workspaceId,
              sourceNodeId: sourceId,
              targetNodeId: targetId,
              type: rel.type,
              propertiesJson: rel.properties || {},
            },
          });
        } else {
          await this.db.client.entityRelationship.update({
            where: { id: existing.id },
            data: {
              propertiesJson: rel.properties || {},
            },
          });
        }
      }
    }

    return {
      nodesCount: extracted.nodes.length,
      relationshipsCount: extracted.relationships.length,
    };
  }

  // Tenancy-Gated Graph query traversal: fetches outgoing and incoming edges matching workspaceId
  async getNeighbors(workspaceId: string, nodeId: string) {
    const node = await this.db.client.entityNode.findFirst({
      where: { id: nodeId, workspaceId },
    });
    if (!node) {
      throw new BadRequestException('Node not found or access denied.');
    }

    // Fetch outgoing
    const outgoing = await this.db.client.entityRelationship.findMany({
      where: { sourceNodeId: nodeId, workspaceId },
      include: { targetNode: true },
    });

    // Fetch incoming
    const incoming = await this.db.client.entityRelationship.findMany({
      where: { targetNodeId: nodeId, workspaceId },
      include: { sourceNode: true },
    });

    return {
      node,
      outgoing: outgoing.map((edge) => ({
        relationshipType: edge.type,
        target: edge.targetNode,
        properties: edge.propertiesJson,
      })),
      incoming: incoming.map((edge) => ({
        relationshipType: edge.type,
        source: edge.sourceNode,
        properties: edge.propertiesJson,
      })),
    };
  }

  // Deduplication & Memory Consolidation
  async consolidateDuplicates(
    workspaceId: string,
    nodeType: string,
  ): Promise<any> {
    const nodes = await this.db.client.entityNode.findMany({
      where: { workspaceId, type: nodeType },
    });

    let mergedCount = 0;
    const handledIds = new Set<string>();

    for (let i = 0; i < nodes.length; i++) {
      const nodeA = nodes[i];
      if (handledIds.has(nodeA.id)) continue;

      for (let j = i + 1; j < nodes.length; j++) {
        const nodeB = nodes[j];
        if (handledIds.has(nodeB.id)) continue;

        // Simple fuzzy/case similarity check: if names match case-insensitively or minor whitespace trim
        if (
          nodeA.name.trim().toLowerCase() === nodeB.name.trim().toLowerCase()
        ) {
          // Merge nodeB into nodeA
          // Re-link all outgoing relationships from nodeB to nodeA
          await this.db.client.entityRelationship.updateMany({
            where: { sourceNodeId: nodeB.id, workspaceId },
            data: { sourceNodeId: nodeA.id },
          });

          // Re-link all incoming relationships to nodeB to nodeA
          await this.db.client.entityRelationship.updateMany({
            where: { targetNodeId: nodeB.id, workspaceId },
            data: { targetNodeId: nodeA.id },
          });

          // Delete duplicate nodeB
          await this.db.client.entityNode.delete({
            where: { id: nodeB.id },
          });

          handledIds.add(nodeB.id);
          mergedCount++;
        }
      }
      handledIds.add(nodeA.id);
    }

    return { mergedCount };
  }

  private simulateEntityExtraction(text: string): ExtractedGraph {
    if (text) {
      /* ignore */
    }
    return {
      nodes: [
        {
          name: 'Burj Crown Apartment 402',
          type: 'Property',
          properties: { sqft: 950 },
        },
        {
          name: 'Emaar Properties',
          type: 'Landlord',
          properties: { rating: 'AAA' },
        },
      ],
      relationships: [
        {
          sourceName: 'Burj Crown Apartment 402',
          sourceType: 'Property',
          targetName: 'Emaar Properties',
          targetType: 'Landlord',
          type: 'OWNED_BY',
          properties: { since: '2026-01-01' },
        },
      ],
    };
  }
}
