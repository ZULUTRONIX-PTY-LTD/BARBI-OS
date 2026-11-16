export type BarbiThinkingMode = 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH';

export interface ComplexityDecision {
  model: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
  thinkingLevel: BarbiThinkingMode;
  reason: string;
}

const COMPLEX_PATTERN =
  /\b(derive|equation|finite element|fea|mohr|von mises|lame|heat transfer|nusselt|reynolds|lagrangian|state[- ]?space|pid|kalman|architecture|debug|root[- ]?cause|proof|contradiction|synthesize|compare|design|optimization|analyze|analysis|roadmap|acceptance test|spec 00[34])\b/i;

export function selectAiRoutingConfig(params: {
  prompt: string;
  attachmentsCount?: number;
  deepThinkRequested?: boolean;
  quickMode?: boolean;
}): ComplexityDecision {
  const text = String(params.prompt || '').trim();
  const hasAttachments = (params.attachmentsCount || 0) > 0;

  if (params.quickMode && !params.deepThinkRequested && !hasAttachments && text.length < 60) {
    return {
      model: 'gemini-3.1-flash-lite',
      thinkingLevel: 'LOW',
      reason: 'Short interactive lookup routed to low-latency gemini-3.1-flash-lite.',
    };
  }

  if (params.deepThinkRequested) {
    return {
      model: 'gemini-4-hydrogen',
      thinkingLevel: 'XHIGH',
      reason: 'Explicit Deep Think enabled: gemini-4-hydrogen at ThinkingLevel.XHIGH.',
    };
  }

  if (hasAttachments || text.length > 180 || COMPLEX_PATTERN.test(text)) {
    return {
      model: 'gemini-4-hydrogen',
      thinkingLevel: 'HIGH',
      reason: 'Complex multi-step or engineering/multimodal reasoning routed to gemini-4-hydrogen at ThinkingLevel.HIGH.',
    };
  }

  return {
    model: 'gemini-4-hydrogen',
    thinkingLevel: 'MEDIUM',
    reason: 'Standard conversational turn routed to gemini-4-hydrogen at ThinkingLevel.MEDIUM.',
  };
}
