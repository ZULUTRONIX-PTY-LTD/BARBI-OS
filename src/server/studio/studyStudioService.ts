import { executePooledAiText } from '../ai/pooledAiExecutor.ts';

export interface ExplainerScene {
  sceneIndex: number;
  title: string;
  visualType: 'concept_map' | 'equation' | 'flowchart' | 'comparison' | 'summary';
  keyBullets: string[];
  highlightFormula?: string;
  narrationText: string;
  durationSec: number;
}

export interface StudyPack {
  title: string;
  executiveSummary: string;
  keyConcepts: Array<{ term: string; explanation: string; equation?: string }>;
  flashcards: Array<{ front: string; back: string }>;
  quiz: Array<{ question: string; options: string[]; answerIndex: number; explanation: string }>;
  explainerScenes: ExplainerScene[];
  createdAt: string;
}

export function buildDeterministicFallbackStudyPack(topicTitle: string, sourceMaterial: string): StudyPack {
  const cleanText = sourceMaterial.replace(/\s+/g, ' ').trim();
  const sentences = cleanText
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 18);

  const keywords = Array.from(
    new Set(
      cleanText
        .replace(/[^a-zA-Z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 5)
    )
  ).slice(0, 8);

  const s0 = sentences[0] || `Structured breakdown of ${topicTitle} prepared for active engineering mastery.`;
  const s1 = sentences[1] || 'Core governing principles connect first-principles equations with practical system behavior.';
  const s2 = sentences[2] || 'Verification checks units, boundary constraints, and real-world failure modes.';

  return {
    title: topicTitle || 'B.A.R.B.I Structured Study Pack',
    executiveSummary: `${s0} ${s1}`.slice(0, 420),
    keyConcepts: (keywords.length >= 3 ? keywords.slice(0, 4) : ['Core Principle', 'Governing Model', 'Boundary Conditions', 'Verification']).map(
      (kw, i) => ({
        term: kw.charAt(0).toUpperCase() + kw.slice(1),
        explanation: sentences[i % Math.max(1, sentences.length)] || `Key domain element governing ${topicTitle}.`,
      })
    ),
    flashcards: [
      {
        front: `What is the core objective of ${topicTitle}?`,
        back: s0,
      },
      {
        front: 'Which governing relationship or constraint dominates this topic?',
        back: s1,
      },
      {
        front: 'How do you verify results during exam or engineering execution?',
        back: s2,
      },
      {
        front: `Name 3 critical terms in ${topicTitle}.`,
        back: keywords.slice(0, 4).join(', ') || topicTitle,
      },
    ],
    quiz: [
      {
        question: `Which statement best captures the foundational concept of ${topicTitle}?`,
        options: [
          s0.slice(0, 110),
          'Ignoring boundary conditions speeds up physical verification.',
          'Qualitative guesses replace SI dimensional consistency.',
          'All subsystems operate independently with zero coupling.',
        ],
        answerIndex: 0,
        explanation: 'The primary statement comes directly from the ingested study material.',
      },
      {
        question: 'What is mandatory before finalizing an analytical or engineering derivation?',
        options: [
          'Skipping units and rounding intermediate steps heavily',
          'Checking SI dimensional consistency, boundary limits, and assumptions',
          'Removing feedback loops without steady-state checks',
          'Treating aspirational targets as verified baseline measurements',
        ],
        answerIndex: 1,
        explanation: 'Dimensional analysis and boundary verification prevent catastrophic design errors.',
      },
    ],
    explainerScenes: [
      {
        sceneIndex: 1,
        title: `Overview: ${topicTitle}`,
        visualType: 'concept_map',
        keyBullets: [s0.slice(0, 95), `Key pillars: ${keywords.slice(0, 3).join(' • ') || topicTitle}`],
        narrationText: `Welcome to B.A.R.B.I Study Studio. Today we break down ${topicTitle}. ${s0}`,
        durationSec: 7,
      },
      {
        sceneIndex: 2,
        title: 'First Principles & Architecture',
        visualType: 'flowchart',
        keyBullets: [s1.slice(0, 95), 'Decompose inputs -> governing law -> verified output'],
        narrationText: `Let us examine the core mechanism. ${s1}`,
        durationSec: 7,
      },
      {
        sceneIndex: 3,
        title: 'Quantitative Formulation',
        visualType: 'equation',
        keyBullets: ['Maintain strict SI units throughout every calculation', 'Express final quantitative outputs clearly'],
        highlightFormula: 'System Output = f(Input State, Governing Law, Boundary Limits)',
        narrationText: 'Always anchor qualitative intuition to explicit governing relationships and consistent S I units.',
        durationSec: 7,
      },
      {
        sceneIndex: 4,
        title: 'Verification & Exam Checklist',
        visualType: 'summary',
        keyBullets: [s2.slice(0, 95), 'Test edge cases, contradictions & active recall flashcards'],
        narrationText: `Finally, verify every assumption. ${s2} Use the flashcards and quiz below to lock this into ARCHIVEX memory.`,
        durationSec: 7,
      },
    ],
    createdAt: new Date().toISOString(),
  };
}

export async function generateNotebookStudyPack(params: {
  userKey: string;
  topicTitle: string;
  materialText: string;
  allowAutoFailover?: boolean;
}) {
  const aiOut = await executePooledAiText({
    userKey: params.userKey,
    allowAutoFailover: params.allowAutoFailover,
    systemInstruction: [
      'You are B.A.R.B.I NotebookLM-Class Study & Explainer Video Director.',
      'Transform uploaded study material into a strict JSON object (no markdown wrappers) with EXACT keys:',
      'title (string), executiveSummary (string),',
      'keyConcepts (array of {term, explanation, equation}),',
      'flashcards (array of 4-6 {front, back}),',
      'quiz (array of 3-4 {question, options (4 strings), answerIndex (0-3), explanation}),',
      'explainerScenes (array of 5-6 {sceneIndex, title, visualType ("concept_map"|"equation"|"flowchart"|"comparison"|"summary"), keyBullets (string[]), highlightFormula (string), narrationText (spoken 1-2 sentences), durationSec (number 5-9)}).',
    ].join(' '),
    prompt: `Topic: ${params.topicTitle}\n\nStudy Material:\n${params.materialText.slice(0, 14000)}`,
  });

  if (aiOut.switchRecommendation) {
    return { studyPack: null, ...aiOut };
  }

  let parsed: Partial<StudyPack> | null = null;
  if (aiOut.reply) {
    try {
      const m = aiOut.reply.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]) as Partial<StudyPack>;
    } catch {
      parsed = null;
    }
  }

  const fallback = buildDeterministicFallbackStudyPack(params.topicTitle, params.materialText);
  const studyPack: StudyPack = {
    title: parsed?.title || fallback.title,
    executiveSummary: parsed?.executiveSummary || fallback.executiveSummary,
    keyConcepts: Array.isArray(parsed?.keyConcepts) && parsed!.keyConcepts.length > 0 ? parsed!.keyConcepts : fallback.keyConcepts,
    flashcards: Array.isArray(parsed?.flashcards) && parsed!.flashcards.length > 0 ? parsed!.flashcards : fallback.flashcards,
    quiz: Array.isArray(parsed?.quiz) && parsed!.quiz.length > 0 ? parsed!.quiz : fallback.quiz,
    explainerScenes:
      Array.isArray(parsed?.explainerScenes) && parsed!.explainerScenes.length > 0
        ? parsed!.explainerScenes
        : fallback.explainerScenes,
    createdAt: new Date().toISOString(),
  };

  return { studyPack, ...aiOut };
}
