import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BARBI_CREATOR_PROFILE,
  BARBI_USABLE_SYSTEMS,
  BARBI_VOICE_SYSTEM_INSTRUCTION,
  BARBI_VOICE_TOOL_DECLARATIONS,
  buildSystemInventoryReport,
  extractChatUiDirectives,
  normalizeUiRenderMutation,
  normalizeVoiceUiAction,
} from './barbiVoiceTools.ts';
import { BARBI_V4_MODULES } from '../v4/moduleCatalog.ts';

describe('barbiVoiceTools', () => {
  it('embeds Treasure Trinity Zulu and ZULUTRONIX (PTY) LTD creator identity plus UI perception rules in system prompt', () => {
    assert.equal(BARBI_CREATOR_PROFILE.creatorName, 'Treasure Trinity Zulu');
    assert.equal(BARBI_CREATOR_PROFILE.companyName, 'ZULUTRONIX (PTY) LTD');
    assert.match(BARBI_VOICE_SYSTEM_INSTRUCTION, /Treasure Trinity Zulu/);
    assert.match(BARBI_VOICE_SYSTEM_INSTRUCTION, /Chief Engineer/);
    assert.match(BARBI_VOICE_SYSTEM_INSTRUCTION, /ZULUTRONIX \(PTY\) LTD/);
    assert.match(BARBI_VOICE_SYSTEM_INSTRUCTION, /read_ui_state/);
    assert.match(BARBI_VOICE_SYSTEM_INSTRUCTION, /mutate_ui_render/);
    assert.match(BARBI_VOICE_SYSTEM_INSTRUCTION, /close_panel/);
    assert.match(BARBI_VOICE_SYSTEM_INSTRUCTION, /bilawalsidhu\/gods-eye-view/);
  });

  it('exposes read_ui_state, inspect_barbi_systems, execute_interface_action, and mutate_ui_render tool declarations', () => {
    const names = BARBI_VOICE_TOOL_DECLARATIONS.map((d) => d.name);
    assert.deepEqual(names, [
      'read_ui_state',
      'inspect_barbi_systems',
      'execute_interface_action',
      'mutate_ui_render',
    ]);
  });

  it("reports God's Eye (Module M11) repositories and interactive launch action when checking systems", () => {
    const report = buildSystemInventoryReport(
      {
        summary: {
          totalModules: BARBI_V4_MODULES.length,
          mountedModules: BARBI_V4_MODULES.filter((m) => m.nativeActive).length,
          syncedRepos: 12,
          totalRepos: 78,
        },
        modules: BARBI_V4_MODULES,
      },
      "god's eye"
    );

    const godsEye = report.godsEyeStatus as {
      presentInSystem: boolean;
      interactiveViewportReady: boolean;
      moduleCode: string;
      moduleId: number;
      repositories: Array<{ slug: string; url: string }>;
      launchAction: string;
    };

    assert.equal(godsEye.presentInSystem, true);
    assert.equal(godsEye.interactiveViewportReady, true);
    assert.equal(godsEye.moduleCode, 'M11');
    assert.equal(godsEye.moduleId, 11);
    assert.equal(godsEye.launchAction, 'open_gods_eye');
    assert.ok(godsEye.repositories.some((r) => r.slug === 'bilawalsidhu/gods-eye-view'));
    assert.ok(godsEye.repositories.some((r) => r.slug === 'koala73/worldmonitor'));

    const usable = report.usableInterfaces as Array<{ action: string }>;
    assert.ok(usable.some((u) => u.action === 'open_gods_eye'));
  });

  it('returns the full usable system inventory when queried broadly', () => {
    const report = buildSystemInventoryReport({
      summary: {
        totalModules: BARBI_V4_MODULES.length,
        mountedModules: 10,
        syncedRepos: 5,
        totalRepos: 78,
      },
      modules: BARBI_V4_MODULES,
    });

    const usable = report.usableInterfaces as Array<{ name: string }>;
    assert.equal(usable.length, BARBI_USABLE_SYSTEMS.length);
  });

  it('normalizes open, close_panel, close_all_panels, and gods_eye_control actions safely', () => {
    const godsEye = normalizeVoiceUiAction({ action: 'gods_eye' });
    assert.ok(godsEye);
    assert.equal(godsEye.action, 'open_gods_eye');
    assert.equal(godsEye.params?.moduleId, 11);

    const closeGodsEye = normalizeVoiceUiAction({ action: 'exit_panel', target: 'godseye' });
    assert.ok(closeGodsEye);
    assert.equal(closeGodsEye.action, 'close_panel');
    assert.equal(closeGodsEye.params?.target, 'gods_eye');

    const fsOpen = normalizeVoiceUiAction({ action: 'file_system' });
    assert.ok(fsOpen);
    assert.equal(fsOpen.action, 'open_file_system_agent');

    const fsClose = normalizeVoiceUiAction({ action: 'close_panel', target: 'fs_agent' });
    assert.ok(fsClose);
    assert.equal(fsClose.action, 'close_panel');
    assert.equal(fsClose.params?.target, 'file_system');

    const closeAll = normalizeVoiceUiAction({ action: 'clear_screen' });
    assert.ok(closeAll);
    assert.equal(closeAll.action, 'close_all_panels');

    const depth = normalizeVoiceUiAction({ action: 'set_sphere_depth', depthTier: 99 });
    assert.ok(depth);
    assert.equal(depth.params?.depthTier, 4);

    const invalid = normalizeVoiceUiAction({ action: 'delete_everything' });
    assert.equal(invalid, null);
  });

  it('normalizes UI render mutations and extracts chat UI directives cleanly', () => {
    const mut = normalizeUiRenderMutation({
      colorTheme: 'cyan',
      rotationSpeed: 2.5,
      hudGlassPreset: 'frosted',
      focusMode: true,
    });
    assert.ok(mut);
    assert.equal(mut.colorTheme, 'cobalt-forge');
    assert.equal(mut.rotationSpeed, 2.5);
    assert.equal(mut.hudGlassPreset, 'frosted');
    assert.equal(mut.focusMode, true);

    const parsed = extractChatUiDirectives(
      'Switching to Cobalt Forge and closing the v4 Hub now.\n[[BARBI_UI_MUTATE:{"colorTheme":"arctic-cyan","hudGlassPreset":"luminous"}]]\n[[BARBI_UI_ACTION:{"action":"close_panel","target":"v4_hub"}]]'
    );
    assert.equal(parsed.cleanText, 'Switching to Cobalt Forge and closing the v4 Hub now.');
    assert.equal(parsed.mutations.length, 1);
    assert.equal(parsed.mutations[0].colorTheme, 'cobalt-forge');
    assert.equal(parsed.actions.length, 1);
    assert.equal(parsed.actions[0].action, 'close_panel');
    assert.equal(parsed.actions[0].params?.target, 'v4_hub');
  });
});
