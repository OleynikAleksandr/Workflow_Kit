import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UPDATE_KIT_TEXT, autopilotSupport } from '../src/index.ts';

const full = { authorization: true, automation: true, complete: true, deferDelivery: true, hostProtocol: 'wfk-host/1', instructions: true };

test('a complete capability of the project Kit is ready', () => {
  assert.deepEqual(autopilotSupport({ capability: full }), { ready: true });
});

test('an older Kit or an incomplete capability needs the update, whatever its version says', () => {
  // Kit 2.2.x and 2.3.0: no capability at all.
  assert.deepEqual(autopilotSupport({ revision: 3, version: '9.9.9' }), { ready: false, missing: ['capability'], text: UPDATE_KIT_TEXT });
  assert.deepEqual(autopilotSupport(null).ready, false);
  // Kit 2.3.1: the grant without the deferral and the instructions.
  const old = autopilotSupport({ capability: { authorization: true, automation: true, complete: false, hostProtocol: 'wfk-host/1' } });
  assert.deepEqual(old, { ready: false, missing: ['deferDelivery', 'instructions', 'complete'], text: UPDATE_KIT_TEXT });
  // Another host protocol is not spoken by this app.
  assert.deepEqual(autopilotSupport({ capability: { ...full, hostProtocol: 'wfk-host/2' } }), { ready: false, missing: ['hostProtocol'], text: UPDATE_KIT_TEXT });
  assert.equal(autopilotSupport({ capability: { ...full, complete: 'yes' } }).ready, false);
});
