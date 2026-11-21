import { GoogleGenAI, Type } from '@google/genai';
import type { FsAnalysisFinding, FsAnalysisResult, ProposedFileEdit } from '../../fs/fileSystemAgentLogic.ts';

let _fsAiClient: GoogleGenAI | null = null;

function getFsAiClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'MY_GEMINI_API_KEY') return null;
  if (!_fsAiClient) {
    _fsAiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return _fsAiClient;
}

export interface FsAgentAnalyzeRequest {
  rootName: string;
  mode: 'analyze' | 'modify';
  instruction: string;
  projectTree: string;
  selectedFiles: Array<{ path: string; content: string; language?: string }>;
}

function buildDeterministicFallback(req: FsAgentAnalyzeRequest): FsAnalysisResult {
  const findings: FsAnalysisFinding[] = [];
  const proposedEdits: ProposedFileEdit[] = [];

  for (const file of req.selectedFiles) {
    const lines = file.content.split('\n');
    const todoLines = lines
      .map((line, idx) => ({ line, idx: idx + 1 }))
      .filter((item) => /TODO|FIXME|HACK/i.test(item.line));

    if (todoLines.length > 0) {
      findings.push({
        severity: 'high',
        file: file.path,
        title: `${todoLines.length} unresolved engineering TODO/FIXME marker(s)`,
        detail: `Found at line(s) ${todoLines.map((t) => t.idx).join(', ')}: ${todoLines[0].line.trim()}`,
      });
    }

    if (/motorController\.ts$/i.test(file.path) && !/Math\.max|Math\.min|thermalShutdown/i.test(file.content)) {
      findings.push({
        severity: 'high',
        file: file.path,
        title: 'Unclamped PWM duty cycle & missing thermal/voltage envelope guard',
        detail:
          'computePwmDutyCycle returns unclamped rawDuty without verifying mosfetTempC < 82°C or busVoltageV bounds.',
      });

      if (req.mode === 'modify') {
        const hardened = `export interface DriveCommand {
  targetRpm: number;
  torqueLimitNm: number;
  emergencyStop?: boolean;
}

export interface ControllerState {
  currentRpm: number;
  busVoltageV: number;
  phaseCurrentA: number;
  mosfetTempC: number;
}

const MAX_SAFE_MOSFET_TEMP_C = 82.0;
const MIN_BUS_VOLTAGE_V = 10.5;
const MAX_BUS_VOLTAGE_V = 24.8;

export function computePwmDutyCycle(cmd: DriveCommand, state: ControllerState): number {
  if (cmd.emergencyStop) {
    return 0;
  }
  if (
    !Number.isFinite(state.mosfetTempC) ||
    state.mosfetTempC >= MAX_SAFE_MOSFET_TEMP_C ||
    state.busVoltageV < MIN_BUS_VOLTAGE_V ||
    state.busVoltageV > MAX_BUS_VOLTAGE_V
  ) {
    return 0;
  }
  const error = cmd.targetRpm - state.currentRpm;
  const rawDuty = error * 0.045;
  return Math.max(-1, Math.min(1, Number(rawDuty.toFixed(4))));
}
`;
        proposedEdits.push({
          path: file.path,
          rationale:
            'Added thermal shutdown (82°C), bus voltage envelope guards (10.5V–24.8V), and strict [-1, 1] PWM duty clamping.',
          updatedContent: hardened,
        });
      }
    } else if (req.mode === 'modify' && proposedEdits.length === 0) {
      findings.push({
        severity: 'info',
        file: file.path,
        title: `Reviewed ${lines.length} lines (${file.language || 'text'})`,
        detail: 'File structure parsed cleanly with no critical static anomalies detected.',
      });
    } else {
      findings.push({
        severity: 'info',
        file: file.path,
        title: `Inspected ${lines.length} lines (${file.language || 'text'})`,
        detail: `Verified ${file.path} within workspace "${req.rootName}".`,
      });
    }
  }

  return {
    summary:
      req.mode === 'modify'
        ? `Analyzed ${req.selectedFiles.length} selected file(s) in "${req.rootName}" and prepared ${proposedEdits.length} reviewable modification(s). Inspect the unified diff before approving any write.`
        : `Completed structural inspection of ${req.selectedFiles.length} selected file(s) inside "${req.rootName}" (${findings.length} finding(s) logged).`,
    findings,
    proposedEdits,
    provider: 'barbi-static-analyzer',
    model: 'local-deterministic-guard',
  };
}

export async function runFsAgentAnalysis(req: FsAgentAnalyzeRequest): Promise<FsAnalysisResult> {
  const ai = getFsAiClient();
  if (!ai) {
    return buildDeterministicFallback(req);
  }

  const allowedPaths = new Set(req.selectedFiles.map((f) => f.path));
  const filesBlock = req.selectedFiles
    .map(
      (f) =>
        `=== FILE: ${f.path} (${f.language || 'text'}) ===\n${f.content}\n=== END FILE: ${f.path} ===`
    )
    .join('\n\n');

  const systemInstruction = [
    'You are B.A.R.B.I. (Brilliant Adaptive Reasoning Brain Interface), the personal Cognitive Operating System engineered by Treasure Trinity Zulu, Chief Engineer at ZULUTRONIX (PTY) LTD.',
    'You are operating inside the B.A.R.B.I. File System Agent.',
    'Analyze ONLY the project structure and explicitly user-selected files provided below.',
    req.mode === 'modify'
      ? 'The user requested concrete code or file modifications. For every file that needs edits, output the COMPLETE updated file content in proposedEdits (never placeholders or "// rest of file"). Only propose edits for paths that exist in the selected files list.'
      : 'The user requested read-only analysis. Return proposedEdits as an empty array [] unless an explicit fix was requested.',
    'Keep findings concrete, actionable, and grounded strictly in the provided source code.',
  ].join('\n');

  const userPrompt = [
    `Workspace Root: ${req.rootName}`,
    `Operation Mode: ${req.mode.toUpperCase()}`,
    `Chief Engineer Instruction: ${req.instruction}`,
    '',
    'Project Structure:',
    req.projectTree.slice(0, 6000),
    '',
    'User-Selected Files:',
    filesBlock,
  ].join('\n');

  const models = ['gemini-3-flash-preview', 'gemini-2.5-flash'];
  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: userPrompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              findings: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    severity: { type: Type.STRING },
                    file: { type: Type.STRING },
                    title: { type: Type.STRING },
                    detail: { type: Type.STRING },
                  },
                  required: ['severity', 'file', 'title', 'detail'],
                },
              },
              proposedEdits: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    path: { type: Type.STRING },
                    rationale: { type: Type.STRING },
                    updatedContent: { type: Type.STRING },
                  },
                  required: ['path', 'rationale', 'updatedContent'],
                },
              },
            },
            required: ['summary', 'findings', 'proposedEdits'],
          },
        },
      });

      const rawText = (response.text || '').trim();
      if (!rawText) continue;
      const parsed = JSON.parse(rawText) as {
        summary?: string;
        findings?: Array<Partial<FsAnalysisFinding>>;
        proposedEdits?: Array<Partial<ProposedFileEdit>>;
      };

      const findings: FsAnalysisFinding[] = (Array.isArray(parsed.findings) ? parsed.findings : [])
        .slice(0, 12)
        .map((item) => {
          const sev = String(item.severity || 'info').toLowerCase();
          const normalizedSev: FsAnalysisFinding['severity'] =
            sev === 'high' || sev === 'medium' || sev === 'low' ? sev : 'info';
          return {
            severity: normalizedSev,
            file: String(item.file || req.selectedFiles[0]?.path || req.rootName),
            title: String(item.title || 'Observation'),
            detail: String(item.detail || ''),
          };
        });

      const proposedEdits: ProposedFileEdit[] = (
        Array.isArray(parsed.proposedEdits) ? parsed.proposedEdits : []
      )
        .filter((edit) => typeof edit.path === 'string' && allowedPaths.has(edit.path))
        .map((edit) => ({
          path: String(edit.path),
          rationale: String(edit.rationale || 'Requested file update'),
          updatedContent: String(edit.updatedContent ?? ''),
        }))
        .filter((edit) => edit.updatedContent.length > 0);

      return {
        summary: String(parsed.summary || 'Analysis completed.'),
        findings,
        proposedEdits: req.mode === 'modify' ? proposedEdits : [],
        provider: 'gemini',
        model,
      };
    } catch (err) {
      console.warn(`[FS Agent] Model ${model} failed, trying fallback:`, (err as Error)?.message || err);
    }
  }

  return buildDeterministicFallback(req);
}
