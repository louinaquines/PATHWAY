import React, { createContext, forwardRef, useContext } from 'react';
import { Platform, StyleSheet, Text, TextInput } from 'react-native';
import { FONTS } from '../theme';

export { FONTS };

export const FONT_FAMILY = 'IBMPlexSans-Regular';
const FontAvailabilityContext = createContext(false);

export function FontAvailabilityProvider({ available, children }) {
  return (
    <FontAvailabilityContext.Provider value={available}>
      {children}
    </FontAvailabilityContext.Provider>
  );
}

export function useCustomFontsAvailable() {
  return useContext(FontAvailabilityContext);
}

export function resolveFontFamily(style, variant) {
  const flattened = StyleSheet.flatten(style) || {};
  const isHeading = variant === 'heading' || flattened.isHeading;
  const rawWeight = flattened.fontWeight;
  const numericWeight = rawWeight === 'bold' ? 700 : Number(rawWeight);

  if (isHeading) {
    if (numericWeight >= 700) return FONTS.headingBold;
    if (numericWeight >= 600) return FONTS.headingSemiBold;
    return FONTS.heading;
  }

  if (numericWeight >= 700) return FONTS.bodyBold;
  if (numericWeight >= 600) return FONTS.bodySemiBold;
  if (numericWeight >= 500) return FONTS.bodyMedium;
  return FONTS.body;
}

function typographyStyle(style, variant, customFontsAvailable) {
  const flattened = StyleSheet.flatten(style) || {};
  const value = flattened.fontWeight;
  const numericWeight = value === 'bold' ? 700 : Number(value);
  const fontWeight = Number.isFinite(numericWeight)
    ? String(Math.min(numericWeight, 700))
    : value;

  const resolvedFamily = flattened.fontFamily || resolveFontFamily(style, variant);
  const isBundledFont = Object.values(FONTS).includes(resolvedFamily);
  const fallbackToSystemFont = !customFontsAvailable && isBundledFont;
  const fontWeightStyle = Platform.OS === 'android' && customFontsAvailable && isBundledFont
    ? undefined
    : fontWeight;

  return {
    fontFamily: fallbackToSystemFont ? undefined : resolvedFamily,
    // Android uses the explicitly loaded face for each weight. Keep the
    // declared weight when using the platform fallback or another font family.
    fontWeight: fontWeightStyle,
  };
}

export const AppText = forwardRef(function AppText({ style, variant, ...props }, ref) {
  const customFontsAvailable = useCustomFontsAvailable();
  return <Text ref={ref} {...props} style={[style, typographyStyle(style, variant, customFontsAvailable)]} />;
});

export const AppTextInput = forwardRef(function AppTextInput({ style, ...props }, ref) {
  const customFontsAvailable = useCustomFontsAvailable();
  return <TextInput ref={ref} {...props} style={[style, typographyStyle(style, 'body', customFontsAvailable)]} />;
});
