import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  conversationMessages,
  conversations,
  habits,
  knowledgeEdges,
  knowledgeNodes,
  memoryContradictions,
  memorySources,
  timelineEvents,
  timerSessions,
  userSettings,
} from '../../db/schema.ts';
import {
  classifyMemoryNodeMeta,
  detectContradictionOrProgression,
  toPgVectorLiteral,
} from '../../lib/vectorMath.ts';
import { generateEmbedding768 } from '../ai/geminiService.ts';

export interface KnowledgeNodeInput {
  nodeKey?: string;
  label: string;
  category?: string;
  domain?: string;
  nexusCategory?: string;
  tier?: string;
  icon?: string;
  summary?: string;
  content: string;
  evidence?: string;
  source?: string;
  sourceUri?: string;
  verificationStatus?: string;
  confidence?: number;
  year?: number;
  isoTimestamp?: string;
  datePrecision?: string;
  metadata?: Record<string, unknown>;
}

const DEFAULT_SEED_NODES: KnowledgeNodeInput[] = [
  {
    nodeKey: 'owner-treasure-zulu',
    label: 'Treasure Trinity Zulu',
    category: 'USER_PROFILE',
    domain: 'identity',
    nexusCategory: 'Identity & Roots',
    tier: 'core',
    icon: '🧠',
    summary: 'Chief Engineer & Founder of ZULUTRONIX (PTY) LTD; Final-year BEngTech Mechanical Engineering student at TUT; ECSA Candidate Engineer.',
    content: 'Treasure Trinity Zulu (born 1997-04-26, South Africa). Legal surname Zulu. Combines Mechanical Engineering, Mechatronics Engineering, and AI/ML via first-principles reasoning.',
    evidence: 'Primary identity anchor in ARCHIVEX Personal Knowledge Profile.',
    source: 'USER_REPORTED_PROFILE',
    verificationStatus: 'VERIFIED',
    confidence: 0.99,
    year: 1997,
    isoTimestamp: '1997-04-26T00:00:00+02:00',
  },
  {
    nodeKey: 'zulutronix',
    label: 'ZULUTRONIX (PTY) LTD',
    category: 'ORGANIZATION',
    domain: 'enterprise',
    nexusCategory: 'Enterprise & Leadership',
    tier: 'hub',
    icon: '⚡',
    summary: 'Registered South African deep-tech & mechatronics R&D company ("Tomorrow\'s Technology Today").',
    content: 'ZULUTRONIX (PTY) LTD, CIPC K2025/699918/07 registered 2025-09-03. Domain: zulutronix.co.za. Focus: Mechatronics, AI/ML, Edge CV, Embedded Systems, B.A.R.B.I.',
    evidence: 'CIPC registration K2025/699918/07 verified 2025-09-03.',
    source: 'CIPC_RECORD',
    verificationStatus: 'VERIFIED',
    confidence: 0.99,
    year: 2025,
    isoTimestamp: '2025-09-03T00:00:00+02:00',
  },
  {
    nodeKey: 'proj-solar-edge-surveillance',
    label: 'Solar Edge Surveillance Node',
    category: 'PROJECT',
    domain: 'mechatronics',
    nexusCategory: 'Engineering & Technology',
    tier: 'core',
    icon: '☀️',
    summary: 'Autonomous Solar-Powered Distributed Edge Surveillance Node (ESP32-P4 + ESP32-C6 + SX1262 LoRa).',
    content: 'PLANNED / DESIGN_TARGET: 2 entrance nodes, ~R8,000 budget, 48h battery autonomy target, IP65/IP66, ~10m ID distance, 70-80 deg FOV, ~180 deg pan-tilt actuation.',
    evidence: 'November 2026 architecture specification.',
    source: 'ZULUTRONIX_SPEC',
    verificationStatus: 'PLANNED',
    confidence: 0.94,
    year: 2026,
    isoTimestamp: '2026-11-10T00:00:00+02:00',
  },
  {
    nodeKey: 'tut-bengtech',
    label: 'TUT BEngTech Mechanical (In Progress)',
    category: 'CREDENTIAL',
    domain: 'academic',
    nexusCategory: 'Academic & Research',
    tier: 'hub',
    icon: '🎓',
    summary: 'Final-year BEngTech Mechanical Engineering at TUT (23 distinctions / 45 modules; 3 outstanding: SOM307B, CMH316B, MEP307B).',
    content: 'Currently in final year at Tshwane University of Technology (not yet graduated). Three remaining modules: Strength of Materials II (SOM307B), Heat Transfer (CMH316B), Dynamics (MEP307B). Also 18 months N6 practicals outstanding.',
    evidence: 'Academic progress statement Nov 2026.',
    source: 'USER_REPORTED_ACADEMIC',
    verificationStatus: 'IN_PROGRESS',
    confidence: 0.98,
    year: 2026,
    isoTimestamp: '2026-11-01T00:00:00+02:00',
  },
];

const DEFAULT_SEED_HABITS = [
  { habitKey: 'hab-1', title: 'SOM307B Strength of Materials II — Mohr & Lamé Problem Set', category: 'professional', completed: true, streak: 18 },
  { habitKey: 'hab-2', title: 'CMH316B Heat Transfer — Convective Boundary Layer Derivations', category: 'professional', completed: true, streak: 14 },
  { habitKey: 'hab-3', title: 'MEP307B Dynamics & Control Systems Exam Drill', category: 'professional', completed: false, streak: 9 },
  { habitKey: 'hab-4', title: 'ZULUTRONIX Solar Edge Node ESP32-P4 + SX1262 BOM Review', category: 'professional', completed: false, streak: 7 },
  { habitKey: 'hab-5', title: 'Smoke-Free Discipline & Morning Breathwork', category: 'personal', completed: true, streak: 12 },
];

export async function seedUserArchivexIfEmpty(userUid: string) {
  try {
    const existing = await db
      .select({ id: knowledgeNodes.id })
      .from(knowledgeNodes)
      .where(eq(knowledgeNodes.userUid, userUid))
      .limit(1);

    if (existing.length > 0) return;

    for (const node of DEFAULT_SEED_NODES) {
      await createOrUpdateKnowledgeNode(userUid, node, { skipConflictScan: true });
    }

    await db
      .insert(knowledgeEdges)
      .values([
        {
          userUid,
          sourceNodeKey: 'owner-treasure-zulu',
          targetNodeKey: 'zulutronix',
          relationType: 'FOUNDED',
          weight: 0.99,
          evidence: 'Chief Engineer & Founder of ZULUTRONIX (PTY) LTD.',
          source: 'ARCHIVEX_SEED',
          confidence: 0.99,
        },
        {
          userUid,
          sourceNodeKey: 'zulutronix',
          targetNodeKey: 'proj-solar-edge-surveillance',
          relationType: 'DEVELOPS',
          weight: 0.95,
          evidence: 'Flagship autonomous surveillance hardware project.',
          source: 'ARCHIVEX_SEED',
          confidence: 0.95,
        },
        {
          userUid,
          sourceNodeKey: 'owner-treasure-zulu',
          targetNodeKey: 'tut-bengtech',
          relationType: 'PURSUING',
          weight: 0.97,
          evidence: 'Final-year undergraduate engineering studies.',
          source: 'ARCHIVEX_SEED',
          confidence: 0.98,
        },
      ])
      .onConflictDoNothing();

    await db
      .insert(timelineEvents)
      .values([
        {
          userUid,
          eventKey: 'evt-1997-birth',
          title: 'Birth of Treasure Trinity Zulu',
          description: 'Born 1997-04-26 in South Africa.',
          eventDate: '1997-04-26',
          datePrecision: 'DAY',
          verificationStatus: 'USER_REPORTED',
          linkedNodeKeys: ['owner-treasure-zulu'],
        },
        {
          userUid,
          eventKey: 'evt-2023-amani',
          title: 'Birth of Amani Aurelia Zulu',
          description: 'First daughter Amani Aurelia Zulu born 2023-04-08.',
          eventDate: '2023-04-08',
          datePrecision: 'DAY',
          verificationStatus: 'USER_REPORTED',
          linkedNodeKeys: ['owner-treasure-zulu'],
        },
        {
          userUid,
          eventKey: 'evt-2025-zulutronix',
          title: 'ZULUTRONIX (PTY) LTD Registered',
          description: 'CIPC Registration K2025/699918/07 on 2025-09-03.',
          eventDate: '2025-09-03',
          datePrecision: 'DAY',
          verificationStatus: 'VERIFIED',
          linkedNodeKeys: ['zulutronix'],
        },
        {
          userUid,
          eventKey: 'evt-2026-nicky',
          title: 'Birth of Nicky Natalia Zulu',
          description: 'Second daughter born in Nelspruit, Mpumalanga at 09:11+02:00.',
          eventDate: '2026-09-07',
          eventTime: '09:11:00+02:00',
          datePrecision: 'MINUTE',
          verificationStatus: 'USER_REPORTED',
          linkedNodeKeys: ['owner-treasure-zulu'],
        },
        {
          userUid,
          eventKey: 'evt-2026-alfred',
          title: 'Passing of Alfred Derrick Zulu',
          description: 'Father passed away unexpectedly on 2026-11-01.',
          eventDate: '2026-11-01',
          datePrecision: 'DAY',
          verificationStatus: 'USER_REPORTED',
          linkedNodeKeys: ['owner-treasure-zulu'],
        },
      ])
      .onConflictDoNothing();

    await db
      .insert(memoryContradictions)
      .values([
        {
          userUid,
          contradictionKey: 'audit-degree-status',
          topic: 'TUT BEngTech Graduation Status',
          conflictingClaim: 'Assuming TUT BEngTech Mechanical Engineering is already graduated.',
          correctedRecord: 'Final-year TUT student as of Nov 2026 with 3 modules outstanding (SOM307B, CMH316B, MEP307B).',
          status: 'VERIFIED_CORRECTION',
          affectedNodeKeys: ['tut-bengtech'],
        },
        {
          userUid,
          contradictionKey: 'audit-family-children',
          topic: 'Children Record Reconciliation',
          conflictingClaim: 'Earlier 2026-09 summary note referenced a son.',
          correctedRecord: 'Explicit Section 9 record confirms two daughters: Amani Aurelia Zulu (2023-04-08) and Nicky Natalia Zulu (2026-09-07).',
          status: 'PENDING_CONFIRMATION',
          affectedNodeKeys: ['owner-treasure-zulu'],
        },
      ])
      .onConflictDoNothing();

    await db
      .insert(habits)
      .values(
        DEFAULT_SEED_HABITS.map((h) => ({
          userUid,
          habitKey: h.habitKey,
          title: h.title,
          category: h.category,
          completed: h.completed,
          streak: h.streak,
        }))
      )
      .onConflictDoNothing();
  } catch (error) {
    console.error('Database query failed in seedUserArchivexIfEmpty:', error);
    throw new Error('Failed to initialize ARCHIVEX user workspace.', { cause: error });
  }
}

export async function listKnowledgeNodes(
  userUid: string,
  filters?: { domain?: string; category?: string; query?: string; limit?: number }
) {
  try {
    const conditions = [eq(knowledgeNodes.userUid, userUid), eq(knowledgeNodes.isDeleted, false)];
    if (filters?.domain) conditions.push(eq(knowledgeNodes.domain, filters.domain));
    if (filters?.category) conditions.push(eq(knowledgeNodes.category, filters.category));
    if (filters?.query) {
      const q = `%${filters.query}%`;
      conditions.push(
        or(
          ilike(knowledgeNodes.label, q),
          ilike(knowledgeNodes.summary, q),
          ilike(knowledgeNodes.content, q)
        )!
      );
    }

    return await db
      .select()
      .from(knowledgeNodes)
      .where(and(...conditions))
      .orderBy(desc(knowledgeNodes.updatedAt))
      .limit(filters?.limit || 200);
  } catch (error) {
    console.error('Database query failed in listKnowledgeNodes:', error);
    throw new Error('Failed to load knowledge nodes.', { cause: error });
  }
}

export async function semanticSearchKnowledgeNodes(
  userUid: string,
  query: string,
  limit = 8
) {
  try {
    const { vector, provider } = await generateEmbedding768(query);
    const vecLiteral = toPgVectorLiteral(vector);

    const rows = await db
      .select({
        id: knowledgeNodes.id,
        nodeKey: knowledgeNodes.nodeKey,
        label: knowledgeNodes.label,
        category: knowledgeNodes.category,
        domain: knowledgeNodes.domain,
        summary: knowledgeNodes.summary,
        content: knowledgeNodes.content,
        evidence: knowledgeNodes.evidence,
        source: knowledgeNodes.source,
        verificationStatus: knowledgeNodes.verificationStatus,
        confidence: knowledgeNodes.confidence,
        isoTimestamp: knowledgeNodes.isoTimestamp,
        version: knowledgeNodes.version,
        similarity: sql<number>`1 - (${knowledgeNodes.embedding} <=> ${vecLiteral}::vector)`,
      })
      .from(knowledgeNodes)
      .where(and(eq(knowledgeNodes.userUid, userUid), eq(knowledgeNodes.isDeleted, false)))
      .orderBy(sql`${knowledgeNodes.embedding} <=> ${vecLiteral}::vector`)
      .limit(limit);

    return { results: rows, embeddingProvider: provider };
  } catch (error) {
    console.error('Database query failed in semanticSearchKnowledgeNodes:', error);
    throw new Error('Semantic vector search failed.', { cause: error });
  }
}

export async function createOrUpdateKnowledgeNode(
  userUid: string,
  input: KnowledgeNodeInput,
  options?: { skipConflictScan?: boolean }
) {
  try {
    const inferredMeta = classifyMemoryNodeMeta(`${input.label} ${input.content}`);
    const nodeKey =
      input.nodeKey?.trim() ||
      `mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const existingRows = await db
      .select()
      .from(knowledgeNodes)
      .where(and(eq(knowledgeNodes.userUid, userUid), eq(knowledgeNodes.nodeKey, nodeKey)))
      .limit(1);

    const { vector } = await generateEmbedding768(
      `${input.label}. ${input.summary || ''}. ${input.content}`
    );

    let detectedContradiction: { id?: number; topic: string; reason: string } | null = null;

    if (!options?.skipConflictScan && existingRows.length === 0) {
      // Compare against top semantically closest nodes to catch contradictions automatically
      const similar = await semanticSearchKnowledgeNodes(userUid, `${input.label} ${input.content}`, 3);
      for (const candidate of similar.results) {
        const analysis = detectContradictionOrProgression(candidate.content, input.content);
        if (analysis.relation === 'CONTRADICTION') {
          const cKey = `contradiction-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          await db
            .insert(memoryContradictions)
            .values({
              userUid,
              contradictionKey: cKey,
              topic: `Potential conflict with "${candidate.label}"`,
              conflictingClaim: input.content,
              correctedRecord: candidate.content,
              status: 'PENDING_CONFIRMATION',
              affectedNodeKeys: [candidate.nodeKey, nodeKey],
            })
            .onConflictDoNothing();
          detectedContradiction = {
            topic: candidate.label,
            reason: analysis.reason,
          };
          break;
        }
      }
    }

    if (existingRows.length > 0) {
      const prev = existingRows[0];
      const nextHistory = [
        ...(prev.revisionHistoryJson || []),
        {
          version: prev.version,
          content: prev.content,
          updatedAt: new Date().toISOString(),
          reason: 'Updated via ARCHIVEX CRUD',
        },
      ];
      const [updated] = await db
        .update(knowledgeNodes)
        .set({
          label: input.label,
          category: input.category || prev.category,
          domain: input.domain || prev.domain,
          nexusCategory: input.nexusCategory || prev.nexusCategory,
          summary: input.summary || input.content.slice(0, 140),
          content: input.content,
          evidence: input.evidence ?? prev.evidence,
          source: input.source || prev.source,
          sourceUri: input.sourceUri ?? prev.sourceUri,
          verificationStatus: input.verificationStatus || prev.verificationStatus,
          confidence: input.confidence ?? prev.confidence,
          version: prev.version + 1,
          isDeleted: false,
          revisionHistoryJson: nextHistory,
          embedding: vector,
          updatedAt: new Date(),
        })
        .where(eq(knowledgeNodes.id, prev.id))
        .returning();

      return { node: updated, detectedContradiction };
    }

    const [created] = await db
      .insert(knowledgeNodes)
      .values({
        userUid,
        nodeKey,
        label: input.label,
        category: input.category || inferredMeta.category,
        domain: input.domain || inferredMeta.domain,
        nexusCategory: input.nexusCategory || 'Engineering & Technology',
        tier: input.tier || 'core',
        icon: input.icon || '',
        summary: input.summary || input.content.slice(0, 140),
        content: input.content,
        evidence: input.evidence || '',
        source: input.source || 'USER_DIRECT',
        sourceUri: input.sourceUri || '',
        verificationStatus: input.verificationStatus || 'USER_REPORTED',
        confidence: input.confidence ?? 0.92,
        year: input.year ?? new Date().getFullYear(),
        isoTimestamp: input.isoTimestamp || new Date().toISOString(),
        datePrecision: input.datePrecision || 'DAY',
        metadataJson: input.metadata || {},
        embedding: vector,
      })
      .returning();

    await db.insert(memorySources).values({
      userUid,
      nodeKey: created.nodeKey,
      sourceType: input.source === 'ZULUTRONIX_SPEC' ? 'file' : 'manual',
      sourceTitle: input.source || 'Direct ARCHIVEX Entry',
      sourceUri: input.sourceUri || '',
      excerpt: input.content.slice(0, 280),
      verifiedAt: created.verificationStatus === 'VERIFIED' ? new Date() : null,
    });

    return { node: created, detectedContradiction };
  } catch (error) {
    console.error('Database query failed in createOrUpdateKnowledgeNode:', error);
    throw new Error('Failed to store ARCHIVEX knowledge node.', { cause: error });
  }
}

export async function deleteKnowledgeNode(
  userUid: string,
  nodeKey: string,
  hardDelete = false
) {
  try {
    if (hardDelete) {
      const deleted = await db
        .delete(knowledgeNodes)
        .where(and(eq(knowledgeNodes.userUid, userUid), eq(knowledgeNodes.nodeKey, nodeKey)))
        .returning();
      return deleted[0] || null;
    }
    const [soft] = await db
      .update(knowledgeNodes)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(and(eq(knowledgeNodes.userUid, userUid), eq(knowledgeNodes.nodeKey, nodeKey)))
      .returning();
    return soft || null;
  } catch (error) {
    console.error('Database query failed in deleteKnowledgeNode:', error);
    throw new Error('Failed to delete knowledge node.', { cause: error });
  }
}

export async function listKnowledgeEdges(userUid: string) {
  try {
    return await db
      .select()
      .from(knowledgeEdges)
      .where(eq(knowledgeEdges.userUid, userUid))
      .orderBy(desc(knowledgeEdges.createdAt));
  } catch (error) {
    console.error('Database query failed in listKnowledgeEdges:', error);
    throw new Error('Failed to load knowledge edges.', { cause: error });
  }
}

export async function createKnowledgeEdge(
  userUid: string,
  edge: {
    sourceNodeKey: string;
    targetNodeKey: string;
    relationType: string;
    weight?: number;
    evidence?: string;
    source?: string;
  }
) {
  try {
    const [created] = await db
      .insert(knowledgeEdges)
      .values({
        userUid,
        sourceNodeKey: edge.sourceNodeKey,
        targetNodeKey: edge.targetNodeKey,
        relationType: edge.relationType || 'RELATES_TO',
        weight: edge.weight ?? 0.85,
        evidence: edge.evidence || '',
        source: edge.source || 'USER_DIRECT',
      })
      .onConflictDoUpdate({
        target: [
          knowledgeEdges.userUid,
          knowledgeEdges.sourceNodeKey,
          knowledgeEdges.targetNodeKey,
          knowledgeEdges.relationType,
        ],
        set: {
          weight: edge.weight ?? 0.85,
          evidence: edge.evidence || '',
        },
      })
      .returning();
    return created;
  } catch (error) {
    console.error('Database query failed in createKnowledgeEdge:', error);
    throw new Error('Failed to create knowledge edge.', { cause: error });
  }
}

export async function deleteKnowledgeEdge(userUid: string, edgeId: number) {
  try {
    const [deleted] = await db
      .delete(knowledgeEdges)
      .where(and(eq(knowledgeEdges.userUid, userUid), eq(knowledgeEdges.id, edgeId)))
      .returning();
    return deleted || null;
  } catch (error) {
    console.error('Database query failed in deleteKnowledgeEdge:', error);
    throw new Error('Failed to delete knowledge edge.', { cause: error });
  }
}

export async function listMemorySources(userUid: string, nodeKey?: string) {
  try {
    const cond = nodeKey
      ? and(eq(memorySources.userUid, userUid), eq(memorySources.nodeKey, nodeKey))
      : eq(memorySources.userUid, userUid);
    return await db
      .select()
      .from(memorySources)
      .where(cond)
      .orderBy(desc(memorySources.createdAt))
      .limit(200);
  } catch (error) {
    console.error('Database query failed in listMemorySources:', error);
    throw new Error('Failed to list memory sources.', { cause: error });
  }
}

export async function addMemorySource(
  userUid: string,
  payload: {
    nodeKey: string;
    sourceType?: string;
    sourceTitle: string;
    sourceUri?: string;
    excerpt?: string;
  }
) {
  try {
    const [row] = await db
      .insert(memorySources)
      .values({
        userUid,
        nodeKey: payload.nodeKey,
        sourceType: payload.sourceType || 'manual',
        sourceTitle: payload.sourceTitle,
        sourceUri: payload.sourceUri || '',
        excerpt: payload.excerpt || '',
      })
      .returning();
    return row;
  } catch (error) {
    console.error('Database query failed in addMemorySource:', error);
    throw new Error('Failed to track memory source.', { cause: error });
  }
}

export async function listContradictionsAndTimeline(userUid: string) {
  try {
    const [contradictions, timeline] = await Promise.all([
      db
        .select()
        .from(memoryContradictions)
        .where(eq(memoryContradictions.userUid, userUid))
        .orderBy(desc(memoryContradictions.createdAt)),
      db
        .select()
        .from(timelineEvents)
        .where(eq(timelineEvents.userUid, userUid))
        .orderBy(timelineEvents.eventDate),
    ]);
    return { contradictions, timeline };
  } catch (error) {
    console.error('Database query failed in listContradictionsAndTimeline:', error);
    throw new Error('Failed to load contradictions and timeline.', { cause: error });
  }
}

export async function resolveContradiction(
  userUid: string,
  contradictionKey: string,
  status: string,
  correctedRecord?: string
) {
  try {
    const [row] = await db
      .update(memoryContradictions)
      .set({
        status,
        ...(correctedRecord ? { correctedRecord } : {}),
        resolvedAt: new Date(),
      })
      .where(
        and(
          eq(memoryContradictions.userUid, userUid),
          eq(memoryContradictions.contradictionKey, contradictionKey)
        )
      )
      .returning();
    return row || null;
  } catch (error) {
    console.error('Database query failed in resolveContradiction:', error);
    throw new Error('Failed to resolve contradiction.', { cause: error });
  }
}

// Conversation History CRUD & Vector Retrieval
export async function listConversations(userUid: string) {
  try {
    return await db
      .select()
      .from(conversations)
      .where(eq(conversations.userUid, userUid))
      .orderBy(desc(conversations.updatedAt))
      .limit(50);
  } catch (error) {
    console.error('Database query failed in listConversations:', error);
    throw new Error('Failed to list conversations.', { cause: error });
  }
}

export async function getConversationMessages(userUid: string, conversationKey: string) {
  try {
    const [conv] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.userUid, userUid), eq(conversations.conversationKey, conversationKey)))
      .limit(1);

    if (!conv) return null;

    const messages = await db
      .select({
        id: conversationMessages.id,
        sender: conversationMessages.sender,
        content: conversationMessages.content,
        model: conversationMessages.model,
        thinkingUsed: conversationMessages.thinkingUsed,
        activatedNodes: conversationMessages.activatedNodesJson,
        attachments: conversationMessages.attachmentsJson,
        createdAt: conversationMessages.createdAt,
      })
      .from(conversationMessages)
      .where(eq(conversationMessages.conversationId, conv.id))
      .orderBy(conversationMessages.createdAt);

    return { conversation: conv, messages };
  } catch (error) {
    console.error('Database query failed in getConversationMessages:', error);
    throw new Error('Failed to fetch conversation messages.', { cause: error });
  }
}

export async function appendConversationTurn(
  userUid: string,
  params: {
    conversationKey: string;
    title?: string;
    sender: 'user' | 'barbi' | 'system';
    content: string;
    model?: string;
    thinkingUsed?: boolean;
    activatedNodes?: string[];
    attachments?: Array<{ name: string; type: string; mimeType?: string }>;
  }
) {
  try {
    const [conv] = await db
      .insert(conversations)
      .values({
        conversationKey: params.conversationKey,
        userUid,
        title: params.title || params.content.slice(0, 64),
        summary: params.content.slice(0, 140),
        modelUsed: params.model || 'gemini-4-hydrogen',
        activatedNodesJson: params.activatedNodes || [],
      })
      .onConflictDoUpdate({
        target: [conversations.userUid, conversations.conversationKey],
        set: {
          summary: params.content.slice(0, 140),
          modelUsed: params.model || 'gemini-4-hydrogen',
          updatedAt: new Date(),
        },
      })
      .returning();

    const { vector } = await generateEmbedding768(params.content);

    const [msg] = await db
      .insert(conversationMessages)
      .values({
        conversationId: conv.id,
        userUid,
        sender: params.sender,
        content: params.content,
        model: params.model || 'gemini-4-hydrogen',
        thinkingUsed: Boolean(params.thinkingUsed),
        activatedNodesJson: params.activatedNodes || [],
        attachmentsJson: params.attachments || [],
        embedding: vector,
      })
      .returning();

    return { conversation: conv, message: msg };
  } catch (error) {
    console.error('Database query failed in appendConversationTurn:', error);
    throw new Error('Failed to save conversation turn.', { cause: error });
  }
}

export async function retrieveRelevantPastConversations(
  userUid: string,
  query: string,
  limit = 5
) {
  try {
    const { vector } = await generateEmbedding768(query);
    const vecLiteral = toPgVectorLiteral(vector);
    return await db
      .select({
        id: conversationMessages.id,
        conversationId: conversationMessages.conversationId,
        sender: conversationMessages.sender,
        content: conversationMessages.content,
        createdAt: conversationMessages.createdAt,
        similarity: sql<number>`1 - (${conversationMessages.embedding} <=> ${vecLiteral}::vector)`,
      })
      .from(conversationMessages)
      .where(eq(conversationMessages.userUid, userUid))
      .orderBy(sql`${conversationMessages.embedding} <=> ${vecLiteral}::vector`)
      .limit(limit);
  } catch (error) {
    console.error('Database query failed in retrieveRelevantPastConversations:', error);
    return [];
  }
}

export async function deleteConversation(userUid: string, conversationKey: string) {
  try {
    const [deleted] = await db
      .delete(conversations)
      .where(and(eq(conversations.userUid, userUid), eq(conversations.conversationKey, conversationKey)))
      .returning();
    return deleted || null;
  } catch (error) {
    console.error('Database query failed in deleteConversation:', error);
    throw new Error('Failed to delete conversation.', { cause: error });
  }
}

// Habits & Timer Sessions & User Settings CRUD
export async function listHabits(userUid: string) {
  try {
    return await db
      .select()
      .from(habits)
      .where(eq(habits.userUid, userUid))
      .orderBy(habits.id);
  } catch (error) {
    console.error('Database query failed in listHabits:', error);
    throw new Error('Failed to fetch habits.', { cause: error });
  }
}

export async function upsertHabit(
  userUid: string,
  payload: {
    habitKey?: string;
    title: string;
    category?: string;
    completed?: boolean;
    streak?: number;
    dueTime?: string;
    reminderEnabled?: boolean;
  }
) {
  try {
    const habitKey = payload.habitKey || `hab-${Date.now()}`;
    const [row] = await db
      .insert(habits)
      .values({
        userUid,
        habitKey,
        title: payload.title,
        category: payload.category || 'professional',
        completed: Boolean(payload.completed),
        streak: payload.streak ?? 0,
        dueTime: payload.dueTime || '',
        reminderEnabled: Boolean(payload.reminderEnabled),
      })
      .onConflictDoUpdate({
        target: [habits.userUid, habits.habitKey],
        set: {
          title: payload.title,
          category: payload.category || 'professional',
          completed: Boolean(payload.completed),
          streak: payload.streak ?? 0,
          dueTime: payload.dueTime || '',
          reminderEnabled: Boolean(payload.reminderEnabled),
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  } catch (error) {
    console.error('Database query failed in upsertHabit:', error);
    throw new Error('Failed to save habit.', { cause: error });
  }
}

export async function deleteHabit(userUid: string, habitKey: string) {
  try {
    const [row] = await db
      .delete(habits)
      .where(and(eq(habits.userUid, userUid), eq(habits.habitKey, habitKey)))
      .returning();
    return row || null;
  } catch (error) {
    console.error('Database query failed in deleteHabit:', error);
    throw new Error('Failed to delete habit.', { cause: error });
  }
}

export async function listTimerSessions(userUid: string) {
  try {
    return await db
      .select()
      .from(timerSessions)
      .where(eq(timerSessions.userUid, userUid))
      .orderBy(desc(timerSessions.startedAt))
      .limit(30);
  } catch (error) {
    console.error('Database query failed in listTimerSessions:', error);
    throw new Error('Failed to fetch timer sessions.', { cause: error });
  }
}

export async function createTimerSession(
  userUid: string,
  payload: { mode: string; durationSeconds: number; completedSeconds: number; status: string; label?: string }
) {
  try {
    const [row] = await db
      .insert(timerSessions)
      .values({
        userUid,
        mode: payload.mode || 'focus',
        durationSeconds: payload.durationSeconds,
        completedSeconds: payload.completedSeconds,
        status: payload.status || 'completed',
        label: payload.label || 'Focus Session',
        completedAt: payload.status === 'completed' ? new Date() : null,
      })
      .returning();
    return row;
  } catch (error) {
    console.error('Database query failed in createTimerSession:', error);
    throw new Error('Failed to log timer session.', { cause: error });
  }
}

export async function getUserSettingsRecord(userUid: string) {
  try {
    const [row] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userUid, userUid))
      .limit(1);
    return row || null;
  } catch (error) {
    console.error('Database query failed in getUserSettingsRecord:', error);
    throw new Error('Failed to fetch settings.', { cause: error });
  }
}

export async function saveUserSettingsRecord(
  userUid: string,
  settingsJson: Record<string, unknown>,
  voiceSettingsJson: Record<string, unknown>
) {
  try {
    const [row] = await db
      .insert(userSettings)
      .values({
        userUid,
        settingsJson,
        voiceSettingsJson,
      })
      .onConflictDoUpdate({
        target: userSettings.userUid,
        set: {
          settingsJson,
          voiceSettingsJson,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  } catch (error) {
    console.error('Database query failed in saveUserSettingsRecord:', error);
    throw new Error('Failed to save settings.', { cause: error });
  }
}

export async function exportFullArchivexBackup(userUid: string) {
  try {
    const [nodes, edges, sources, contradictionsAndTimeline, convs, habitRows, settings] =
      await Promise.all([
        listKnowledgeNodes(userUid, { limit: 1000 }),
        listKnowledgeEdges(userUid),
        listMemorySources(userUid),
        listContradictionsAndTimeline(userUid),
        listConversations(userUid),
        listHabits(userUid),
        getUserSettingsRecord(userUid),
      ]);

    return {
      schema: 'BARBI_ARCHIVEX_PGVECTOR_V2',
      exportedAt: new Date().toISOString(),
      nodes,
      edges,
      sources,
      contradictions: contradictionsAndTimeline.contradictions,
      timelineEvents: contradictionsAndTimeline.timeline,
      conversations: convs,
      habits: habitRows,
      settings,
    };
  } catch (error) {
    console.error('Database query failed in exportFullArchivexBackup:', error);
    throw new Error('Failed to export ARCHIVEX backup.', { cause: error });
  }
}
