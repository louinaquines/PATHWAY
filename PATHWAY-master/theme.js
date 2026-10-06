export const COLORS = {
  // Keep the interface bright and neutral; use cobalt blue and gold as accents.
  // `brandNavy` remains as a compatibility token for existing components.
  brandNavy: '#075FC9',
  brandBlue: '#075FC9',
  brandSky: '#10B8FE',
  brandGold: '#F8AA04',
  brandYellow: '#FED02A',

  primary: '#0864CE',
  primaryDark: '#0757B8',
  primaryDeep: '#F6F8FB',
  primaryLight: '#EAF2FF',
  primarySubtle: '#F5F8FF',

  secondary: '#0874C8',
  secondaryDark: '#07559A',
  secondaryLight: '#E4F3FF',
  secondarySubtle: '#F2F9FF',

  // Accessible dark-gold text; use brandGold for decorative fills and marks.
  accent: '#805300',
  accentDark: '#664200',
  accentLight: '#FFF3C4',
  accentSubtle: '#FFFAE8',

  // Status Colors
  success: '#10B981',        // Emerald Success
  successDark: '#047857',
  successLight: '#D1FAE5',
  successSubtle: '#ECFDF5',

  warning: '#C98700',
  warningDark: '#805100',
  warningLight: '#FEF3C7',
  warningSubtle: '#FFFBEB',

  danger: '#EF4444',         // Crimson Danger
  dangerDark: '#B91C1C',
  dangerLight: '#FEE2E2',
  dangerSubtle: '#FEF2F2',

  info: '#0067B1',
  infoLight: '#E0F2FE',
  infoDark: '#005087',

  // Modern Neutral Surface & Card Architecture
  background: '#F6F8FB',
  surface: '#FFFFFF',        // Pure white cards
  surfaceMuted: '#F1F5F9',   // Slightly shaded background for nested elements
  border: '#DCE4EF',
  borderLight: '#EDF1F6',
  borderFocus: '#0067B1',
  inputBg: '#FFFFFF',        // Form field background
  inputBgDisabled: '#F6F8FB',

  // Typography
  textPrimary: '#0F172A',    // Deep slate text
  textSecondary: '#475569',  // Medium slate
  textMuted: '#64748B',
  textPlaceholder: '#94A3B8',
  textOnPrimary: '#FFFFFF',
  textOnSecondary: '#FFFFFF',
  textOnGold: '#26313F',
  focusRing: '#0088D1',
};

export const SPACE = {
  hairline: 1,
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  section: 28,
};

export const TYPE = {
  micro: 11,
  caption: 12,
  bodySmall: 14,
  body: 16,
  titleSmall: 18,
  title: 24,
  display: 32,
  editorialTitle: 28,
  editorialHero: 36,
};

export const FONTS = {
  heading: 'Newsreader-Regular',
  headingSemiBold: 'Newsreader-SemiBold',
  headingBold: 'Newsreader-Bold',
  body: 'IBMPlexSans-Regular',
  bodyMedium: 'IBMPlexSans-Medium',
  bodySemiBold: 'IBMPlexSans-SemiBold',
  bodyBold: 'IBMPlexSans-Bold',
};


export const SHADOWS = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  soft: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.025,
    shadowRadius: 3,
    elevation: 1,
  },
  card: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  hover: {
    shadowColor: '#075FC9',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 13,
    elevation: 4,
  },
  floating: {
    shadowColor: '#075FC9',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 6,
  },
};

export const RADIUS = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 22,
  full: 9999,
};

export const MOTION = {
  screenDuration: 220,
  pressScale: 0.985,
  pressSpeed: 30,
  screenOffset: 8,
};
