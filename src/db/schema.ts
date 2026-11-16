import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from 'drizzle-orm/pg-core';

// Users linked to Firebase Auth UID
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull().default('Treasure Trinity Zulu'),
  honorific: text('honorific').notNull().default('Chief Engineer'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ARCHIVEX Knowledge Nodes (pgvector 768-dim semantic embeddings + full provenance)
export const knowledgeNodes = pgTable(
  'knowledge_nodes',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid')
      .references(() => users.uid, { onDelete: 'cascade' })
      .notNull(),
    nodeKey: text('node_key').notNull(),
    label: text('label').notNull(),
    category: text('category').notNull().default('KNOWLEDGE'),
    domain: text('domain').notNull().default('core'),
    nexusCategory: text('nexus_category').notNull().default('Engineering & Technology'),
    tier: text('tier').notNull().default('core'),
    icon: text('icon').default(''),
    summary: text('summary').notNull().default(''),
    content: text('content').notNull(),
    evidence: text('evidence').notNull().default(''),
    source: text('source').notNull().default('USER_DIRECT'),
    sourceUri: text('source_uri').default(''),
    verificationStatus: text('verification_status').notNull().default('USER_REPORTED'),
    confidence: doublePrecision('confidence').notNull().default(0.92),
    year: integer('year').notNull().default(2026),
    isoTimestamp: text('iso_timestamp').notNull().default('2026-11-16T00:00:00Z'),
    datePrecision: text('date_precision').notNull().default('DAY'),
    version: integer('version').notNull().default(1),
    isDeleted: boolean('is_deleted').notNull().default(false),
    revisionHistoryJson: jsonb('revision_history_json')
      .$type<Array<{ version: number; content: string; updatedAt: string; reason?: string }>>()
      .notNull()
      .default([]),
    metadataJson: jsonb('metadata_json')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    embedding: vector('embedding', { dimensions: 768 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('knowledge_nodes_user_key_idx').on(table.userUid, table.nodeKey),
    index('knowledge_nodes_user_domain_idx').on(table.userUid, table.domain),
    index('knowledge_nodes_user_cat_idx').on(table.userUid, table.category),
  ]
);

// ARCHIVEX Knowledge Graph Relationships (Directed edges with provenance & weight)
export const knowledgeEdges = pgTable(
  'knowledge_edges',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid')
      .references(() => users.uid, { onDelete: 'cascade' })
      .notNull(),
    sourceNodeKey: text('source_node_key').notNull(),
    targetNodeKey: text('target_node_key').notNull(),
    relationType: text('relation_type').notNull().default('RELATES_TO'),
    weight: doublePrecision('weight').notNull().default(0.85),
    evidence: text('evidence').notNull().default(''),
    source: text('source').notNull().default('ARCHIVEX_GRAPH'),
    confidence: doublePrecision('confidence').notNull().default(0.88),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('knowledge_edges_unique_idx').on(
      table.userUid,
      table.sourceNodeKey,
      table.targetNodeKey,
      table.relationType
    ),
  ]
);

// ARCHIVEX Source & Evidence Tracking
export const memorySources = pgTable(
  'memory_sources',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid')
      .references(() => users.uid, { onDelete: 'cascade' })
      .notNull(),
    nodeKey: text('node_key').notNull(),
    sourceType: text('source_type').notNull().default('manual'),
    sourceTitle: text('source_title').notNull(),
    sourceUri: text('source_uri').default(''),
    excerpt: text('excerpt').notNull().default(''),
    sha256: text('sha256').default(''),
    verifiedAt: timestamp('verified_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('memory_sources_user_node_idx').on(table.userUid, table.nodeKey),
  ]
);

// ARCHIVEX Contradiction & Factual Integrity Registry
export const memoryContradictions = pgTable(
  'memory_contradictions',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid')
      .references(() => users.uid, { onDelete: 'cascade' })
      .notNull(),
    contradictionKey: text('contradiction_key').notNull(),
    topic: text('topic').notNull(),
    conflictingClaim: text('conflicting_claim').notNull(),
    correctedRecord: text('corrected_record').notNull(),
    status: text('status').notNull().default('PENDING_CONFIRMATION'),
    affectedNodeKeys: jsonb('affected_node_keys').$type<string[]>().notNull().default([]),
    resolvedAt: timestamp('resolved_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('memory_contradictions_user_key_idx').on(table.userUid, table.contradictionKey),
  ]
);

// Chronological Timeline Events (ISO-8601 Temporal Indexing)
export const timelineEvents = pgTable(
  'timeline_events',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid')
      .references(() => users.uid, { onDelete: 'cascade' })
      .notNull(),
    eventKey: text('event_key').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    eventDate: text('event_date').notNull(),
    eventTime: text('event_time').default(''),
    datePrecision: text('date_precision').notNull().default('DAY'),
    verificationStatus: text('verification_status').notNull().default('USER_REPORTED'),
    linkedNodeKeys: jsonb('linked_node_keys').$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('timeline_events_user_key_idx').on(table.userUid, table.eventKey),
  ]
);

// Persistent Conversations
export const conversations = pgTable(
  'conversations',
  {
    id: serial('id').primaryKey(),
    conversationKey: text('conversation_key').notNull(),
    userUid: text('user_uid')
      .references(() => users.uid, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').notNull(),
    summary: text('summary').default(''),
    modelUsed: text('model_used').notNull().default('gemini-4-hydrogen'),
    activatedNodesJson: jsonb('activated_nodes_json').$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('conversations_user_key_idx').on(table.userUid, table.conversationKey),
  ]
);

// Persistent Conversation Messages (with semantic embedding for retrieval)
export const conversationMessages = pgTable(
  'conversation_messages',
  {
    id: serial('id').primaryKey(),
    conversationId: integer('conversation_id')
      .references(() => conversations.id, { onDelete: 'cascade' })
      .notNull(),
    userUid: text('user_uid')
      .references(() => users.uid, { onDelete: 'cascade' })
      .notNull(),
    sender: text('sender').notNull(),
    content: text('content').notNull(),
    model: text('model').default('gemini-4-hydrogen'),
    thinkingUsed: boolean('thinking_used').notNull().default(false),
    activatedNodesJson: jsonb('activated_nodes_json').$type<string[]>().notNull().default([]),
    attachmentsJson: jsonb('attachments_json')
      .$type<Array<{ name: string; type: string; mimeType?: string }>>()
      .notNull()
      .default([]),
    embedding: vector('embedding', { dimensions: 768 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('conv_msgs_conv_created_idx').on(table.conversationId, table.createdAt),
    index('conv_msgs_user_created_idx').on(table.userUid, table.createdAt),
  ]
);

// Habits & To-Do Matrix
export const habits = pgTable(
  'habits',
  {
    id: serial('id').primaryKey(),
    habitKey: text('habit_key').notNull(),
    userUid: text('user_uid')
      .references(() => users.uid, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').notNull(),
    category: text('category').notNull().default('professional'),
    completed: boolean('completed').notNull().default(false),
    streak: integer('streak').notNull().default(0),
    dueTime: text('due_time').default(''),
    reminderEnabled: boolean('reminder_enabled').notNull().default(false),
    completedHistoryJson: jsonb('completed_history_json').$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('habits_user_key_idx').on(table.userUid, table.habitKey),
  ]
);

// Smart Timer & PolyGhost Hourglass Focus Sessions
export const timerSessions = pgTable(
  'timer_sessions',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid')
      .references(() => users.uid, { onDelete: 'cascade' })
      .notNull(),
    mode: text('mode').notNull().default('focus'),
    durationSeconds: integer('duration_seconds').notNull(),
    completedSeconds: integer('completed_seconds').notNull().default(0),
    status: text('status').notNull().default('completed'),
    label: text('label').default('Focus Session'),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
  },
  (table) => [
    index('timer_sessions_user_idx').on(table.userUid, table.startedAt),
  ]
);

// Per-User Sphere, Voice & Cross-Device Preferences
export const userSettings = pgTable('user_settings', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid')
    .references(() => users.uid, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  settingsJson: jsonb('settings_json').$type<Record<string, unknown>>().notNull().default({}),
  voiceSettingsJson: jsonb('voice_settings_json')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Drizzle Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  knowledgeNodes: many(knowledgeNodes),
  knowledgeEdges: many(knowledgeEdges),
  memorySources: many(memorySources),
  contradictions: many(memoryContradictions),
  timelineEvents: many(timelineEvents),
  conversations: many(conversations),
  habits: many(habits),
  timerSessions: many(timerSessions),
  userSettings: one(userSettings, {
    fields: [users.uid],
    references: [userSettings.userUid],
  }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  user: one(users, {
    fields: [conversations.userUid],
    references: [users.uid],
  }),
  messages: many(conversationMessages),
}));

export const conversationMessagesRelations = relations(conversationMessages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationMessages.conversationId],
    references: [conversations.id],
  }),
  user: one(users, {
    fields: [conversationMessages.userUid],
    references: [users.uid],
  }),
}));
