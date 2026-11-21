import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLOR_THEME_ORDER,
  COMPLEXITY_ORDER,
  DEFAULT_SPHERE_CONFIG,
  GOLD_CORE_LOCK,
  MAX_ROTATION_SPEED,
  MIN_ROTATION_SPEED,
  SPHERE_CONFIG_STORAGE_KEY,
  clampRotationSpeed,
  getComplexityProfile,
  getThemePalette,
  loadSphereConfig,
  normalizeSphereConfig,
  saveSphereConfig,
} from './sphereConfigLogic';

describe('sphereConfigLogic', () => {
  it('clamps rotation speed cleanly within [0, 3.0] and handles invalid inputs', () => {
    assert.equal(clampRotationSpeed(-2), MIN_ROTATION_SPEED);
    assert.equal(clampRotationSpeed(0), 0);
    assert.equal(clampRotationSpeed(1.256), 1.26);
    assert.equal(clampRotationSpeed(99), MAX_ROTATION_SPEED);
    assert.equal(clampRotationSpeed(Number.NaN), DEFAULT_SPHERE_CONFIG.rotationSpeed);
    assert.equal(clampRotationSpeed('invalid'), DEFAULT_SPHERE_CONFIG.rotationSpeed);
  });

  it('normalizes partial or invalid configs safely to defaults', () => {
    assert.deepEqual(normalizeSphereConfig(null), DEFAULT_SPHERE_CONFIG);
    assert.deepEqual(
      normalizeSphereConfig({
        rotationSpeed: 2.5,
        visualComplexity: 'unknown' as never,
        colorTheme: 'cobalt-forge',
      }),
      {
        rotationSpeed: 2.5,
        visualComplexity: 'high',
        colorTheme: 'cobalt-forge',
      }
    );
  });

  it('scales visual complexity monotonically from minimal to ultra', () => {
    const profiles = COMPLEXITY_ORDER.map((id) => getComplexityProfile(id));
    for (let i = 1; i < profiles.length; i++) {
      assert.ok(profiles[i].panelRatio >= profiles[i - 1].panelRatio);
      assert.ok(profiles[i].gyroLineRatio >= profiles[i - 1].gyroLineRatio);
      assert.ok(profiles[i].starShellCount >= profiles[i - 1].starShellCount);
      assert.ok(profiles[i].bloomScale >= profiles[i - 1].bloomScale);
    }
    assert.equal(profiles[0].outerShellVisible, false);
    assert.equal(profiles[2].starShellCount, 6);
  });

  it('preserves the permanent golden core lock across every color theme', () => {
    for (const themeId of COLOR_THEME_ORDER) {
      const palette = getThemePalette(themeId);
      assert.equal(palette.coreGoldLock.coreHex, GOLD_CORE_LOCK.coreHex);
      assert.equal(palette.coreGoldLock.brightHex, GOLD_CORE_LOCK.brightHex);
      assert.equal(palette.coreGoldLock.paleHex, GOLD_CORE_LOCK.paleHex);
      assert.equal(palette.coreGoldLock.cssCore, '#D96800');
      assert.equal(palette.coreGoldLock.cssBright, '#F0820A');
      assert.equal(palette.coreGoldLock.cssPale, '#F5B860');
      assert.equal(palette.three.starColors.length, 6);
    }
  });

  it('persists and loads config safely from storage and recovers from corrupt JSON', () => {
    const map = new Map<string, string>();
    const fakeStorage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
    };

    const saved = saveSphereConfig(
      { rotationSpeed: 1.75, visualComplexity: 'ultra', colorTheme: 'emerald-circuit' },
      fakeStorage
    );
    assert.deepEqual(saved, {
      rotationSpeed: 1.75,
      visualComplexity: 'ultra',
      colorTheme: 'emerald-circuit',
    });
    assert.deepEqual(loadSphereConfig(fakeStorage), saved);

    map.set(SPHERE_CONFIG_STORAGE_KEY, '{corrupt json');
    assert.deepEqual(loadSphereConfig(fakeStorage), DEFAULT_SPHERE_CONFIG);
  });
});
