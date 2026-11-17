import { randomUUID } from 'node:crypto';
import { generateBarbiChatTurn } from './geminiService.ts';
import { createAiObservabilityContext } from './observability.ts';
import {
  callOpenAiCompatibleProvider,
  estimateTokenCount,
  getProviderQuotaSnapshot,
  selectBestAvailableProvider,
} from './providerRegistry.ts';

export interface PooledAiResult {
  reply: string;
  model: string;
  activeProviderId: string;
  quotaSnapshot: ReturnType<typeof getProviderQuotaSnapshot>;
  switchRecommendation?: {
    currentProvider: ReturnType<typeof getProviderQuotaSnapshot>['providers'][number] | null;
    recommendedProvider: ReturnType<typeof getProviderQuotaSnapshot>['providers'][number] | null;
    cooldownRemainingSec: number;
    reason: string;
    warningType: 'HARD_STOP_PREVENT_EXCEED' | 'LOW_QUOTA_WARNING';
  };
  lowQuotaWarning?: {
    activeProvider: ReturnType<typeof getProviderQuotaSnapshot>['providers'][number] | null;
    recommendedNext: ReturnType<typeof getProviderQuotaSnapshot>['providers'][number] | null;
    reason: string;
  };
  failoverTrail: Array<{ providerId: string; status: string; reason?: string }>;
}

export async function executePooledAiText(params: {
  userKey: string;
  systemInstruction: string;
  prompt: string;
  allowAutoFailover?: boolean;
  providerId?: string;
}): Promise<PooledAiResult> {
  const observability = createAiObservabilityContext({
    sessionId: `workflow-${randomUUID()}`,
    ...(params.userKey === 'guest' ? {} : { distinctId: params.userKey }),
  });
  const estimatedTokens = estimateTokenCount(params.systemInstruction + params.prompt) + 600;
  const prefsSnapshot = getProviderQuotaSnapshot(params.userKey);
  const routingDecision = selectBestAvailableProvider(
    params.userKey,
    [],
    Date.now(),
    estimatedTokens
  );

  // HARD FREE-TIER STOP: never exceed free tier! Throw warning recommendation instead of overrunning cap
  if (
    prefsSnapshot.switchMode === 'recommend' &&
    routingDecision.needsSwitchPrompt &&
    routingDecision.recommendedNext &&
    !params.providerId &&
    !params.allowAutoFailover
  ) {
    return {
      reply: '',
      model: routingDecision.primary?.modelId || 'quota-guard',
      activeProviderId: routingDecision.primary?.id || prefsSnapshot.activeProviderId,
      quotaSnapshot: prefsSnapshot,
      failoverTrail: [],
      switchRecommendation: {
        currentProvider: routingDecision.primary,
        recommendedProvider: routingDecision.recommendedNext,
        cooldownRemainingSec: routingDecision.primary?.cooldownRemainingSec || 30,
        reason: routingDecision.reason,
        warningType: 'HARD_STOP_PREVENT_EXCEED',
      },
    };
  }

  const orderedCandidates = [
    ...(params.providerId ? [params.providerId] : []),
    ...(routingDecision.primary ? [routingDecision.primary.id] : []),
    ...prefsSnapshot.providers
      .filter((p) => p.enabled && p.configured && (p.status === 'READY' || p.status === 'LOW_QUOTA'))
      .map((p) => p.id),
  ].filter((id, idx, arr) => arr.indexOf(id) === idx);

  const failoverTrail: Array<{ providerId: string; status: string; reason?: string }> = [];
  let reply = '';
  let modelUsed = 'gemini-4-hydrogen';
  let activeProviderId = orderedCandidates[0] || prefsSnapshot.activeProviderId;

  for (const candidateId of orderedCandidates) {
    activeProviderId = candidateId;
    try {
      if (candidateId === 'gemini') {
        const gRes = await generateBarbiChatTurn({
          prompt: `${params.systemInstruction}\n\n${params.prompt}`,
          quickMode: false,
          observability,
        });
        if (gRes.reply) {
          reply = gRes.reply;
          modelUsed = gRes.model;
          failoverTrail.push({ providerId: 'gemini', status: 'succeeded' });
          break;
        }
        failoverTrail.push({ providerId: 'gemini', status: 'skipped', reason: 'Empty or unconfigured' });
      } else {
        const extRes = await callOpenAiCompatibleProvider({
          providerId: candidateId,
          systemInstruction: params.systemInstruction,
          prompt: params.prompt,
          observability,
        });
        reply = extRes.reply;
        modelUsed = `${candidateId}:${extRes.model}`;
        failoverTrail.push({ providerId: candidateId, status: 'succeeded' });
        break;
      }
    } catch (err) {
      failoverTrail.push({
        providerId: candidateId,
        status: 'failed',
        reason: (err as Error)?.message || 'error',
      });
      if (prefsSnapshot.switchMode === 'recommend' && !params.allowAutoFailover) {
        break;
      }
    }
  }

  const postSnapshot = getProviderQuotaSnapshot(params.userKey);
  const postDecision = selectBestAvailableProvider(params.userKey);

  return {
    reply,
    model: modelUsed,
    activeProviderId,
    quotaSnapshot: postSnapshot,
    failoverTrail,
    ...(!reply && postDecision.needsSwitchPrompt && postDecision.recommendedNext
      ? {
          switchRecommendation: {
            currentProvider: postDecision.primary,
            recommendedProvider: postDecision.recommendedNext,
            cooldownRemainingSec: postDecision.primary?.cooldownRemainingSec || 30,
            reason: postDecision.reason,
            warningType: 'HARD_STOP_PREVENT_EXCEED' as const,
          },
        }
      : postDecision.lowQuotaWarning && postDecision.recommendedNext
        ? {
            lowQuotaWarning: {
              activeProvider: postDecision.primary,
              recommendedNext: postDecision.recommendedNext,
              reason: postDecision.reason,
            },
          }
        : {}),
  };
}
