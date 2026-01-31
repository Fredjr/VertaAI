/**
 * Slack Message Ingester (Phase 4: Knowledge Gap Detection)
 *
 * Fetches and filters question-like messages from Slack channels
 * for clustering and coverage drift detection.
 */

import { WebClient } from '@slack/web-api';
import { prisma } from '../../lib/db.js';

// ============================================================================
// Types
// ============================================================================

export interface SlackMessage {
  ts: string;
  text: string;
  user: string;
  channel: string;
  channelName: string;
  threadTs?: string;
  replyCount?: number;
  reactions?: Array<{ name: string; count: number }>;
}

export interface IngestionResult {
  workspaceId: string;
  channelId: string;
  channelName: string;
  totalMessages: number;
  questionMessages: number;
  messages: SlackMessage[];
}

export interface IngestionOptions {
  daysBack?: number; // Default: 7 days
  maxMessages?: number; // Default: 1000
  channelIds?: string[]; // Specific channels, or fetch all public
}

// ============================================================================
// Question Detection Patterns
// ============================================================================

// Patterns that indicate a question
const QUESTION_PATTERNS = [
  /\?(\s|$)/, // Ends with question mark
  /^(how|what|why|when|where|who|which|can|could|would|should|is|are|does|do|did|has|have|will)\s/i,
  /anyone\s+(know|help|tried|have)/i,
  /wondering\s+(if|how|why|what)/i,
  /help\s+(me|with|understanding)/i,
  /not\s+sure\s+(how|why|what|if)/i,
  /confused\s+(about|by)/i,
  /stuck\s+(on|with)/i,
  /having\s+(trouble|issues|problems)/i,
  /doesn['\u2019]t\s+(work|seem)/i,
  /can['\u2019]t\s+(find|figure|get|understand)/i,
];

// Patterns to exclude (noise)
const EXCLUDE_PATTERNS = [
  /^(yes|no|ok|okay|thanks|thank you|lol|haha|nice|great|awesome|cool)[\s!?]*$/i,
  /^<@[A-Z0-9]+>/i, // Just a mention
  /^:[a-z_]+:$/i, // Just an emoji
  /^\s*$/i, // Empty or whitespace
];

// Minimum text length for a valid question
const MIN_QUESTION_LENGTH = 15;

// ============================================================================
// Functions
// ============================================================================

/**
 * Check if a message looks like a question
 */
export function isQuestionMessage(text: string): boolean {
  if (!text || text.length < MIN_QUESTION_LENGTH) return false;

  // Check exclusions first
  for (const pattern of EXCLUDE_PATTERNS) {
    if (pattern.test(text)) return false;
  }

  // Check if it matches any question pattern
  for (const pattern of QUESTION_PATTERNS) {
    if (pattern.test(text)) return true;
  }

  return false;
}

/**
 * Clean Slack message text (remove mentions, links, code blocks)
 */
export function cleanMessageText(text: string): string {
  return text
    .replace(/<@[A-Z0-9]+>/g, '@user') // Replace user mentions
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1') // Replace channel mentions
    .replace(/<https?:\/\/[^|>]+\|([^>]+)>/g, '$1') // Replace links with label
    .replace(/<https?:\/\/[^>]+>/g, '[link]') // Replace bare links
    .replace(/```[\s\S]*?```/g, '[code block]') // Replace code blocks
    .replace(/`[^`]+`/g, '[code]') // Replace inline code
    .replace(/:[a-z_]+:/g, '') // Remove emoji shortcodes
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Fetch recent messages from a Slack channel
 */
export async function fetchChannelMessages(
  client: WebClient,
  channelId: string,
  daysBack: number = 7,
  maxMessages: number = 1000
): Promise<SlackMessage[]> {
  const messages: SlackMessage[] = [];
  const oldestTimestamp = Math.floor((Date.now() - daysBack * 24 * 60 * 60 * 1000) / 1000);

  // Get channel info for the name
  let channelName = channelId;
  try {
    const channelInfo = await client.conversations.info({ channel: channelId });
    channelName = (channelInfo.channel as { name?: string })?.name || channelId;
  } catch {
    console.log(`[SlackIngester] Could not get channel info for ${channelId}`);
  }

  let cursor: string | undefined;
  let fetchedCount = 0;

  while (fetchedCount < maxMessages) {
    const result = await client.conversations.history({
      channel: channelId,
      oldest: String(oldestTimestamp),
      limit: Math.min(200, maxMessages - fetchedCount),
      cursor,
    });

    if (!result.messages || result.messages.length === 0) break;

    for (const msg of result.messages) {
      if (msg.type === 'message' && msg.text && msg.user) {
        messages.push({
          ts: msg.ts || '',
          text: msg.text,
          user: msg.user,
          channel: channelId,
          channelName,
          threadTs: msg.thread_ts,
          replyCount: msg.reply_count,
          reactions: msg.reactions?.map((r) => ({
            name: r.name || '',
            count: r.count || 0,
          })),
        });
      }
    }

    fetchedCount = messages.length;
    cursor = result.response_metadata?.next_cursor;
    if (!cursor) break;
  }

  return messages;
}

/**
 * Filter messages to only keep questions
 */
export function filterQuestionMessages(messages: SlackMessage[]): SlackMessage[] {
  return messages.filter((msg) => {
    const cleanedText = cleanMessageText(msg.text);
    return isQuestionMessage(cleanedText);
  });
}

/**
 * Ingest questions from multiple channels for a workspace
 */
export async function ingestRecentQuestions(
  workspaceId: string,
  botToken: string,
  options: IngestionOptions = {}
): Promise<IngestionResult[]> {
  const client = new WebClient(botToken);
  const results: IngestionResult[] = [];
  const { daysBack = 7, maxMessages = 1000, channelIds } = options;

  // Get channels to process
  let channels = channelIds || [];

  if (channels.length === 0) {
    // Fetch all public channels the bot is a member of
    try {
      const channelsResult = await client.conversations.list({
        types: 'public_channel',
        exclude_archived: true,
        limit: 100,
      });

      channels =
        channelsResult.channels
          ?.filter((c) => c.is_member && c.id)
          .map((c) => c.id as string) || [];
    } catch (error) {
      console.error(`[SlackIngester] Error fetching channels:`, error);
      return results;
    }
  }

  console.log(`[SlackIngester] Processing ${channels.length} channels for workspace ${workspaceId}`);

  // Process each channel
  for (const channelId of channels) {
    try {
      const allMessages = await fetchChannelMessages(client, channelId, daysBack, maxMessages);
      const questionMessages = filterQuestionMessages(allMessages);

      if (questionMessages.length > 0) {
        results.push({
          workspaceId,
          channelId,
          channelName: questionMessages[0]?.channelName || channelId,
          totalMessages: allMessages.length,
          questionMessages: questionMessages.length,
          messages: questionMessages,
        });
      }

      console.log(
        `[SlackIngester] Channel ${channelId}: ${allMessages.length} total, ${questionMessages.length} questions`
      );
    } catch (error) {
      console.error(`[SlackIngester] Error processing channel ${channelId}:`, error);
    }
  }

  return results;
}

/**
 * Get the Slack bot token for a workspace
 */
export async function getSlackBotToken(workspaceId: string): Promise<string | null> {
  const integration = await prisma.integration.findUnique({
    where: {
      workspaceId_type: {
        workspaceId,
        type: 'slack',
      },
    },
  });

  if (!integration || integration.status !== 'connected') {
    return null;
  }

  const config = integration.config as { bot_token?: string };
  return config.bot_token || null;
}

