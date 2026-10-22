import { expect, test } from 'claude-code/testing'

import { UI_VIEW_SINCE, isMissingCall, versionAtLeast } from './engine-support'

test('ui.view is known from the engine version: 2.1.302 and later have it, 2.1.296 and unreadable versions do not', () => {
  expect(versionAtLeast('2.1.302', UI_VIEW_SINCE)).toBe(true)
  expect(versionAtLeast('2.1.310', UI_VIEW_SINCE)).toBe(true)
  expect(versionAtLeast('2.2.0', UI_VIEW_SINCE)).toBe(true)
  expect(versionAtLeast('3.0.0', UI_VIEW_SINCE)).toBe(true)
  expect(versionAtLeast('2.1.302-dev', UI_VIEW_SINCE)).toBe(true)
  expect(versionAtLeast('2.1.302-dev.20261017.t101500.sha1a2b3c4', UI_VIEW_SINCE)).toBe(true)
  expect(versionAtLeast('2.1.301', UI_VIEW_SINCE)).toBe(false)
  expect(versionAtLeast('2.1.296', UI_VIEW_SINCE)).toBe(false)
  expect(versionAtLeast('2.0.999', UI_VIEW_SINCE)).toBe(false)
  expect(versionAtLeast('1.9.400', UI_VIEW_SINCE)).toBe(false)
  expect(versionAtLeast('', UI_VIEW_SINCE)).toBe(false)
  expect(versionAtLeast(undefined, UI_VIEW_SINCE)).toBe(false)
  expect(versionAtLeast('dev build', UI_VIEW_SINCE)).toBe(false)
})

test('a call the engine lacks is recognised by its error (the person\'s exact message), other failures are not', () => {
  expect(isMissingCall(new TypeError("$.ui.view is not a function. (In '$.ui.view({ agentId })', '$.ui.view' is undefined)"), 'ui.view')).toBe(true)
  expect(isMissingCall(new TypeError('$.ui.view is not a function'), 'ui.view')).toBe(true)
  expect(isMissingCall(new TypeError("Cannot read properties of undefined (reading 'view')"), 'ui.view')).toBe(false)
  expect(isMissingCall(new Error('view refused'), 'ui.view')).toBe(false)
  expect(isMissingCall(new Error('the session draws no main view'), 'ui.view')).toBe(false)
  expect(isMissingCall(new TypeError('$.ui.panes is not a function'), 'ui.view')).toBe(false)
  expect(isMissingCall('ui.view is not a function', 'ui.view')).toBe(true)
})
