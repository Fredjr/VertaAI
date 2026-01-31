/**
 * Question Clusterer (Phase 4: Knowledge Gap Detection)
 *
 * Groups similar questions using NLP-based similarity scoring
 * for coverage drift detection.
 */

import { prisma } from '../../lib/db.js';
import { cleanMessageText, type SlackMessage } from './slackMessageIngester.js';
import { randomUUID } from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface QuestionCluster {
  id: string;
  representativeQuestion: string;
  topic: string;
  questions: ClusteredQuestion[];
  frequency: number;
  uniqueAskers: Set<string>;
  avgSimilarity: number;
  firstSeen: Date;
  lastSeen: Date;
  channelId: string;
  channelName: string;
}

export interface ClusteredQuestion {
  text: string;
  cleanedText: string;
  user: string;
  ts: string;
  similarity: number;
}

export interface ClusteringOptions {
  similarityThreshold?: number; // Default: 0.7
  minClusterSize?: number; // Default: 3 questions
  maxClusters?: number; // Default: 50
}

// ============================================================================
// Similarity Functions
// ============================================================================

/**
 * Extract keywords from text (simple tokenization)
 */
export function extractKeywords(text: string): Set<string> {
  const stopWords = new Set([
    'i', 'me', 'my', 'we', 'our', 'you', 'your', 'it', 'its', 'the', 'a', 'an',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'can', 'may',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'up', 'about',
    'into', 'through', 'after', 'above', 'below', 'between', 'and', 'or',
    'but', 'if', 'then', 'else', 'when', 'where', 'why', 'how', 'what', 'which',
    'who', 'this', 'that', 'these', 'those', 'there', 'here', 'so', 'than',
    'just', 'also', 'only', 'very', 'too', 'some', 'any', 'all', 'each',
    'anyone', 'someone', 'something', 'anything', 'know', 'get', 'got',
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  return new Set(words);
}

/**
 * Calculate Jaccard similarity between two sets of keywords
 */
export function jaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
  if (set1.size === 0 && set2.size === 0) return 0;

  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}

/**
 * Calculate similarity between two questions
 */
export function calculateSimilarity(text1: string, text2: string): number {
  const keywords1 = extractKeywords(text1);
  const keywords2 = extractKeywords(text2);

  // Base Jaccard similarity
  const jaccard = jaccardSimilarity(keywords1, keywords2);

  // Boost if questions start with same word (how, what, why, etc.)
  const firstWord1 = text1.toLowerCase().split(/\s+/)[0];
  const firstWord2 = text2.toLowerCase().split(/\s+/)[0];
  const questionWordBoost = firstWord1 === firstWord2 ? 0.1 : 0;

  // Boost if questions have similar length (within 50%)
  const lenRatio = Math.min(text1.length, text2.length) / Math.max(text1.length, text2.length);
  const lengthBoost = lenRatio > 0.5 ? (lenRatio - 0.5) * 0.2 : 0;

  return Math.min(1, jaccard + questionWordBoost + lengthBoost);
}

/**
 * Infer topic from question text
 */
export function inferTopic(text: string): string {
  const topicPatterns: Array<{ pattern: RegExp; topic: string }> = [
    { pattern: /deploy|release|rollout|rollback|helm|k8s|kubernetes/i, topic: 'deployment' },
    { pattern: /auth|login|token|permission|access|oauth|sso/i, topic: 'authentication' },
    { pattern: /api|endpoint|request|response|rest|graphql/i, topic: 'api' },
    { pattern: /config|env|environment|variable|setting/i, topic: 'configuration' },
    { pattern: /database|db|sql|query|migration|postgres|mysql/i, topic: 'database' },
    { pattern: /test|testing|spec|unit|integration|e2e/i, topic: 'testing' },
    { pattern: /error|exception|bug|issue|fix|debug/i, topic: 'troubleshooting' },
    { pattern: /setup|install|onboard|getting.?started/i, topic: 'onboarding' },
    { pattern: /monitor|alert|log|metric|datadog|grafana/i, topic: 'observability' },
    { pattern: /ci|cd|pipeline|github.?action|jenkins/i, topic: 'ci-cd' },
    { pattern: /docker|container|image|registry/i, topic: 'containers' },
    { pattern: /aws|gcp|azure|cloud/i, topic: 'cloud' },
  ];

  for (const { pattern, topic } of topicPatterns) {
    if (pattern.test(text)) return topic;
  }

  return 'general';
}

/**
 * Find the most representative question in a cluster
 * (longest question with most keywords)
 */
export function findRepresentativeQuestion(questions: ClusteredQuestion[]): string {
  if (questions.length === 0) return '';
  const firstQuestion = questions[0];
  if (questions.length === 1) return firstQuestion?.cleanedText || '';

  // Score each question by keyword count and reasonable length
  const scored = questions.map(q => ({
    text: q.cleanedText,
    score: extractKeywords(q.cleanedText).size * (1 - Math.abs(q.cleanedText.length - 100) / 200),
  }));

  scored.sort((a, b) => b.score - a.score);
  const topScored = scored[0];
  return topScored?.text || '';
}

// ============================================================================
// Clustering Algorithm
// ============================================================================

/**
 * Cluster similar questions using greedy clustering
 */
export function clusterQuestions(
  messages: SlackMessage[],
  options: ClusteringOptions = {}
): QuestionCluster[] {
  const { similarityThreshold = 0.7, minClusterSize = 3, maxClusters = 50 } = options;

  // Prepare questions with cleaned text
  const questions: ClusteredQuestion[] = messages.map(msg => ({
    text: msg.text,
    cleanedText: cleanMessageText(msg.text),
    user: msg.user,
    ts: msg.ts,
    similarity: 1.0,
  }));

  const clusters: QuestionCluster[] = [];
  const assigned = new Set<number>();

  // Sort by timestamp (newer first) to prefer recent questions as representatives
  const sortedIndices = questions
    .map((_, i) => i)
    .sort((a, b) => {
      const qA = questions[a];
      const qB = questions[b];
      return (qB?.ts || '').localeCompare(qA?.ts || '');
    });

  for (const seedIdx of sortedIndices) {
    if (assigned.has(seedIdx) || clusters.length >= maxClusters) continue;

    const seed = questions[seedIdx];
    if (!seed) continue;

    const seedMessage = messages[seedIdx];
    if (!seedMessage) continue;

    const cluster: QuestionCluster = {
      id: randomUUID(),
      representativeQuestion: seed.cleanedText,
      topic: inferTopic(seed.cleanedText),
      questions: [{ ...seed, similarity: 1.0 }],
      frequency: 1,
      uniqueAskers: new Set([seed.user]),
      avgSimilarity: 1.0,
      firstSeen: new Date(parseFloat(seed.ts) * 1000),
      lastSeen: new Date(parseFloat(seed.ts) * 1000),
      channelId: seedMessage.channel,
      channelName: seedMessage.channelName,
    };

    assigned.add(seedIdx);

    // Find similar questions
    for (let i = 0; i < questions.length; i++) {
      if (assigned.has(i)) continue;

      const candidate = questions[i];
      if (!candidate) continue;

      const similarity = calculateSimilarity(seed.cleanedText, candidate.cleanedText);

      if (similarity >= similarityThreshold) {
        cluster.questions.push({ ...candidate, similarity });
        cluster.uniqueAskers.add(candidate.user);
        assigned.add(i);

        const candidateTime = new Date(parseFloat(candidate.ts) * 1000);
        if (candidateTime < cluster.firstSeen) cluster.firstSeen = candidateTime;
        if (candidateTime > cluster.lastSeen) cluster.lastSeen = candidateTime;
      }
    }

    // Only keep clusters that meet minimum size
    if (cluster.questions.length >= minClusterSize) {
      cluster.frequency = cluster.questions.length;
      cluster.representativeQuestion = findRepresentativeQuestion(cluster.questions);
      cluster.avgSimilarity =
        cluster.questions.reduce((sum, q) => sum + q.similarity, 0) / cluster.questions.length;

      clusters.push(cluster);
    }
  }

  // Sort by frequency (most common questions first)
  clusters.sort((a, b) => b.frequency - a.frequency);

  return clusters;
}

/**
 * Save clusters to database
 */
export async function saveClusters(
  workspaceId: string,
  clusters: QuestionCluster[]
): Promise<number> {
  let savedCount = 0;

  for (const cluster of clusters) {
    try {
      await prisma.slackQuestionCluster.upsert({
        where: {
          workspaceId_id: {
            workspaceId,
            id: cluster.id,
          },
        },
        create: {
          workspaceId,
          id: cluster.id,
          channelId: cluster.channelId,
          channelName: cluster.channelName,
          representativeQuestion: cluster.representativeQuestion,
          topic: cluster.topic,
          messageCount: cluster.frequency,
          uniqueAskers: cluster.uniqueAskers.size,
          firstSeen: cluster.firstSeen,
          lastSeen: cluster.lastSeen,
          avgSimilarity: cluster.avgSimilarity,
          sampleMessages: cluster.questions.slice(0, 10).map(q => ({
            text: q.text,
            cleanedText: q.cleanedText,
            user: q.user,
            ts: q.ts,
            similarity: q.similarity,
          })),
        },
        update: {
          messageCount: cluster.frequency,
          uniqueAskers: cluster.uniqueAskers.size,
          lastSeen: cluster.lastSeen,
          avgSimilarity: cluster.avgSimilarity,
          sampleMessages: cluster.questions.slice(0, 10).map(q => ({
            text: q.text,
            cleanedText: q.cleanedText,
            user: q.user,
            ts: q.ts,
            similarity: q.similarity,
          })),
        },
      });
      savedCount++;
    } catch (error) {
      console.error(`[QuestionClusterer] Error saving cluster ${cluster.id}:`, error);
    }
  }

  return savedCount;
}

/**
 * Get unprocessed clusters for a workspace
 */
export async function getUnprocessedClusters(
  workspaceId: string,
  limit: number = 10
): Promise<QuestionCluster[]> {
  const dbClusters = await prisma.slackQuestionCluster.findMany({
    where: {
      workspaceId,
      processedAt: null,
    },
    orderBy: { messageCount: 'desc' },
    take: limit,
  });

  return dbClusters.map(c => {
    // Parse sampleMessages from JSON
    const sampleMessages = Array.isArray(c.sampleMessages)
      ? (c.sampleMessages as unknown as ClusteredQuestion[])
      : [];

    return {
      id: c.id,
      representativeQuestion: c.representativeQuestion,
      topic: c.topic,
      questions: sampleMessages,
      frequency: c.messageCount,
      uniqueAskers: new Set<string>(), // Not reconstructed from DB
      avgSimilarity: c.avgSimilarity,
      firstSeen: c.firstSeen,
      lastSeen: c.lastSeen,
      channelId: c.channelId,
      channelName: c.channelName,
    };
  });
}

/**
 * Mark a cluster as processed
 */
export async function markClusterProcessed(
  workspaceId: string,
  clusterId: string,
  signalEventId?: string
): Promise<void> {
  await prisma.slackQuestionCluster.update({
    where: {
      workspaceId_id: {
        workspaceId,
        id: clusterId,
      },
    },
    data: {
      processedAt: new Date(),
      signalEventId,
    },
  });
}

