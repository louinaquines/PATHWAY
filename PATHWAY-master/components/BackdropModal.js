import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { useReducedMotion } from './Motion';

// Keep the scrim stationary. Native Modal slide animates the entire window,
// including its dim layer; animate content independently instead.
export default function BackdropModal({ visible, children, animationType = 'fade', ...props }) {
  const [mounted, setMounted] = useState(Boolean(visible));
  const progress = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();
  const { height } = useWindowDimensions();
  useEffect(() => {
    if (visible) setMounted(true);
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0, duration: reducedMotion ? 0 : visible ? 260 : 200,
      easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web',
    });
    animation.start(({ finished }) => { if (finished && !visible) setMounted(false); });
    return () => animation.stop();
  }, [visible, reducedMotion, progress]);
  const root = React.Children.only(children);
  const backgroundColor = StyleSheet.flatten(root.props.style)?.backgroundColor || 'rgba(15,23,42,0.45)';
  const panelStyle = {
    opacity: animationType === 'slide' ? 1 : progress,
    transform: animationType === 'slide' && !reducedMotion
      ? [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) }] : [],
  };
  const rootChildren = React.Children.toArray(root.props.children);
  // Keep the full-screen layout/keyboard container and dismissal target fixed.
  // Only the final child (the sheet/card/drawer) receives the transition.
  const panelIndex = rootChildren.length - 1;
  const content = rootChildren.map((child, index) => {
    if (index !== panelIndex || !React.isValidElement(child)) return child;
    return <Animated.View key={child.key || 'panel'} {...child.props}
      style={[child.props.style, panelStyle]} />;
  });
  return (
    <Modal {...props} visible={mounted} transparent animationType="none">
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor, opacity: progress }]} />
      {React.cloneElement(root, { style: [root.props.style, { backgroundColor: 'transparent' }] }, content)}
    </Modal>
  );
}
