import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCoordPair,
  latLonToVector3,
  normalizeIssTelemetry,
  normalizeOpenSkyStates,
  normalizeUsgsEarthquakes,
} from './godsEyeLogic';

test('latLonToVector3 preserves exact sphere radius for equator and poles', () => {
  const r = 2.0;
  const eq = latLonToVector3(0, 0, r);
  const magEq = Math.hypot(eq.x, eq.y, eq.z);
  assert.ok(Math.abs(magEq - r) < 1e-6);

  const pta = latLonToVector3(-25.7479, 28.2293, r);
  const magPta = Math.hypot(pta.x, pta.y, pta.z);
  assert.ok(Math.abs(magPta - r) < 1e-6);
  assert.ok(pta.y < 0, 'Southern hemisphere must have negative Y');
});

test('normalizeUsgsEarthquakes parses and sorts seismic events by magnitude', () => {
  const sample = {
    features: [
      {
        id: 'eq1',
        properties: { mag: 3.2, place: '12 km E of Cape Town', time: 1730000000000 },
        geometry: { coordinates: [18.5, -33.9, 10.4] },
      },
      {
        id: 'eq2',
        properties: { mag: 5.8, place: 'South Indian Ocean Ridge', time: 1730000500000 },
        geometry: { coordinates: [42.1, -38.4, 15.0] },
      },
    ],
  };

  const events = normalizeUsgsEarthquakes(sample);
  assert.equal(events.length, 2);
  assert.equal(events[0].id, 'eq-eq2');
  assert.equal(events[0].severity, 'critical');
  assert.equal(events[0].metricPrimary, 'M 5.8');
  assert.equal(events[1].severity, 'nominal');
});

test('normalizeIssTelemetry and normalizeOpenSkyStates parse valid feeds safely', () => {
  const iss = normalizeIssTelemetry({
    latitude: -25.1,
    longitude: 28.4,
    altitude: 419.5,
    velocity: 27610,
    visibility: 'daylight',
  });
  assert.ok(iss);
  assert.equal(iss.live, true);
  assert.equal(formatCoordPair(iss.lat, iss.lon), '25.10°S, 28.40°E');

  const planes = normalizeOpenSkyStates({
    states: [['00b123', 'SAA342 ', 'South Africa', 0, 0, 28.23, -26.13, 10668, false, 240]],
  });
  assert.equal(planes.length, 1);
  assert.equal(planes[0].layer, 'aviation');
  assert.match(planes[0].name, /SAA342/);
});
