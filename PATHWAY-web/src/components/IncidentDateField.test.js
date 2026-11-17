import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');

function fixture(platform = 'android', props = {}) {
  let picker;
  const changed = jest.fn();
  const button = ({ children, onPress, disabled, accessibilityLabel }) => <button aria-label={accessibilityLabel} onClick={onPress} disabled={disabled}>{children}</button>;
  const modules = {
    react: React,
    'react-native': { Platform: { OS: platform }, View: ({ children }) => <div>{children}</div>, StyleSheet: { create: x => x }, Keyboard: { dismiss: jest.fn() } },
    '@react-native-community/datetimepicker': { __esModule: true, default: p => { picker = p; return <span>Calendar</span>; } },
    './Motion': { MotionTouchableOpacity: button }, './AppText': { AppText: ({ children }) => <span>{children}</span> },
    './Icons': { CalendarIcon: () => null },
  };
  const calendar = { exports: {} };
  const calendarCode = babel.transformFileSync(path.resolve(__dirname, '../../../PATHWAY-master/services/calendarDate.js'), { configFile: false, babelrc: false, plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
  new Function('module', 'exports', calendarCode)(calendar, calendar.exports);
  modules['../services/calendarDate'] = calendar.exports;
  const source = fs.readFileSync(path.resolve(__dirname, '../../../PATHWAY-master/components/IncidentDateField.js'), 'utf8');
  const compiled = babel.transformSync(source, { configFile: false, babelrc: false, presets: [require.resolve('@babel/preset-react')], plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(name => modules[name], loaded, loaded.exports);
  render(React.createElement(loaded.exports.default, { value: '', onChange: changed, maximumDate: '2026-10-26', ...props }));
  return { changed, picker: () => picker };
}

test('Android opens calendar, ignores cancellation, and saves date without UTC shifting', () => {
  const f = fixture();
  fireEvent.click(screen.getByRole('button', { name: /Choose incident date/ }));
  expect(f.picker().maximumDate.getDate()).toBe(26);
  act(() => f.picker().onChange({ type: 'dismissed' }));
  expect(f.changed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /Choose incident date/ }));
  act(() => f.picker().onChange({ type: 'set' }, new Date(2026, 9, 13)));
  expect(f.changed).toHaveBeenCalledWith('2026-10-13');
});

test('selected date can be cleared and locked field cannot open or clear', () => {
  const f = fixture('android', { value: '2026-10-13', disabled: true });
  expect(screen.getByRole('button', { name: /Choose incident date/ })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Clear incident date' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Clear incident date' }));
  expect(f.changed).not.toHaveBeenCalled();
});

test('web uses a date input with a maximum date and supports clearing', () => {
  const f = fixture('web', { value: '2026-10-13' });
  const input = screen.getByLabelText('Incident date, optional');
  expect(input).toHaveAttribute('type', 'date');
  expect(input).toHaveAttribute('max', '2026-10-26');
  fireEvent.change(input, { target: { value: '' } });
  expect(f.changed).toHaveBeenCalledWith('');
});

test('iOS picker can close explicitly and selected dates can be cleared', () => {
  const f = fixture('ios', { value: '2026-10-13' });
  fireEvent.click(screen.getByRole('button', { name: /Choose incident date/ }));
  expect(screen.getByText('Calendar')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(screen.queryByText('Calendar')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Clear incident date' }));
  expect(f.changed).toHaveBeenCalledWith('');
});
