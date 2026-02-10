/**
 * Gap #6 Part 2: Budget Enforcement
 * Enforces budget limits (max drifts per day/week, max Slack notifications per hour)
 */

import { prisma } from '../../lib/prisma.js';
import { BudgetConfig, parseBudgets } from './types.js';

export interface BudgetCheckResult {
  allowed: boolean;
  reason?: string;
  currentUsage: {
    driftsToday: number;
    driftsThisWeek: number;
    slackNotificationsThisHour: number;
  };
  limits: BudgetConfig;
}

/**
 * Check if a drift can be processed based on budget limits
 */
export async function checkBudget(args: {
  workspaceId: string;
  planId: string;
  action: 'process_drift' | 'send_slack_notification';
}): Promise<BudgetCheckResult> {
  const { workspaceId, planId, action } = args;

  // Get plan budgets
  const plan = await prisma.driftPlan.findUnique({
    where: { workspaceId_id: { workspaceId, id: planId } },
    select: { budgets: true },
  });

  if (!plan) {
    throw new Error(`Plan ${planId} not found`);
  }

  const budgets = parseBudgets(plan.budgets);

  // Calculate time windows
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // Count drifts processed today
  const driftsToday = await prisma.planRun.count({
    where: {
      workspaceId,
      planId,
      executedAt: { gte: oneDayAgo },
    },
  });

  // Count drifts processed this week
  const driftsThisWeek = await prisma.planRun.count({
    where: {
      workspaceId,
      planId,
      executedAt: { gte: oneWeekAgo },
    },
  });

  // Count Slack notifications sent this hour
  const slackNotificationsThisHour = await prisma.planRun.count({
    where: {
      workspaceId,
      planId,
      routingAction: 'slack_notify',
      executedAt: { gte: oneHourAgo },
    },
  });

  const currentUsage = {
    driftsToday,
    driftsThisWeek,
    slackNotificationsThisHour,
  };

  // Check budget limits based on action
  if (action === 'process_drift') {
    if (driftsToday >= budgets.maxDriftsPerDay) {
      return {
        allowed: false,
        reason: `Daily drift limit reached (${driftsToday}/${budgets.maxDriftsPerDay})`,
        currentUsage,
        limits: budgets,
      };
    }

    if (driftsThisWeek >= budgets.maxDriftsPerWeek) {
      return {
        allowed: false,
        reason: `Weekly drift limit reached (${driftsThisWeek}/${budgets.maxDriftsPerWeek})`,
        currentUsage,
        limits: budgets,
      };
    }
  }

  if (action === 'send_slack_notification') {
    if (slackNotificationsThisHour >= budgets.maxSlackNotificationsPerHour) {
      return {
        allowed: false,
        reason: `Hourly Slack notification limit reached (${slackNotificationsThisHour}/${budgets.maxSlackNotificationsPerHour})`,
        currentUsage,
        limits: budgets,
      };
    }
  }

  return {
    allowed: true,
    currentUsage,
    limits: budgets,
  };
}

/**
 * Get current budget usage for a plan
 */
export async function getBudgetUsage(args: {
  workspaceId: string;
  planId: string;
}): Promise<{
  currentUsage: {
    driftsToday: number;
    driftsThisWeek: number;
    slackNotificationsThisHour: number;
  };
  limits: BudgetConfig;
  percentages: {
    dailyDrifts: number;
    weeklyDrifts: number;
    hourlySlackNotifications: number;
  };
}> {
  const result = await checkBudget({
    ...args,
    action: 'process_drift',
  });

  return {
    currentUsage: result.currentUsage,
    limits: result.limits,
    percentages: {
      dailyDrifts: (result.currentUsage.driftsToday / result.limits.maxDriftsPerDay) * 100,
      weeklyDrifts: (result.currentUsage.driftsThisWeek / result.limits.maxDriftsPerWeek) * 100,
      hourlySlackNotifications: (result.currentUsage.slackNotificationsThisHour / result.limits.maxSlackNotificationsPerHour) * 100,
    },
  };
}

