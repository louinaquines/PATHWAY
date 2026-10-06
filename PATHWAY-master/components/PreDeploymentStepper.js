import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { COLORS, SHADOWS } from '../theme';
import { AppText as Text } from './AppText';

const STEPS = ['Documents', 'Company', 'Review', 'Approval'];

/** Shared four-stage pipeline indicator used by every pre-deployment screen. */
export default function PreDeploymentStepper({ activeStep = 1, completedSteps, onStepPress, style }) {
  const active = Math.min(Math.max(Number(activeStep) || 1, 1), STEPS.length);
  const isComplete = step => completedSteps == null
    ? step < active
    : completedSteps.includes(step);
  let completedPrefix = 0;
  while (completedPrefix < STEPS.length && isComplete(completedPrefix + 1)) completedPrefix += 1;
  const progressWidth = `${completedPrefix * 25}%`;

  return (
    <View style={[styles.card, style]}>
      <View style={styles.track} />
      {completedPrefix > 0 && <View style={[styles.progress, { width: progressWidth }]} />}
      <View style={styles.row}>
        {STEPS.map((label, index) => {
          const step = index + 1;
          const isCurrent = step === active;
          const isDone = isComplete(step);

          return (
            <TouchableOpacity
              key={label}
              style={styles.stepItem}
              onPress={() => onStepPress?.(step)}
              disabled={!onStepPress}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={`Open ${label} step`}
              accessibilityState={{ selected: isCurrent }}
            >
              <View style={[styles.circle, (isCurrent || isDone) && styles.circleFilled]}>
                <Text style={[styles.number, (isCurrent || isDone) && styles.numberFilled]}>{step}</Text>
              </View>
              <Text style={[styles.label, isDone && styles.labelComplete, isCurrent && styles.labelCurrent]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 76,
    marginBottom: 18,
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 9,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.borderLight || '#E7EDF5',
    backgroundColor: '#FFFFFF',
    position: 'relative',
    ...SHADOWS.soft,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  track: {
    position: 'absolute',
    left: '12.5%',
    right: '12.5%',
    top: 23,
    height: 2,
    borderRadius: 2,
    backgroundColor: '#E5EAF2',
  },
  progress: {
    position: 'absolute',
    left: '12.5%',
    top: 23,
    height: 2,
    borderRadius: 2,
    backgroundColor: COLORS.primary,
  },
  stepItem: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
    zIndex: 1,
  },
  circle: {
    width: 27,
    height: 27,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
    borderWidth: 1,
    borderColor: '#D8E1EC',
    backgroundColor: '#FFFFFF',
  },
  circleFilled: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  number: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
  numberFilled: {
    color: '#FFFFFF',
  },
  label: {
    color: '#8998AD',
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
  },
  labelComplete: {
    color: '#5F7899',
  },
  labelCurrent: {
    color: COLORS.primary,
    fontWeight: '800',
  },
});
