import React from 'react';
import logoSource from '../assets/pathway-logo-2026-cutout.png';

export const PATHWAY_LOGO_SOURCE = logoSource;

export default function PathwayLogo({ size, alt = 'PATHWAY logo', decorative = false, className, style }) {
  return (
    <img
      src={logoSource}
      alt={decorative ? '' : alt}
      className={className}
      style={{
        ...(size ? { width: size, height: size } : {}),
        objectFit: 'contain',
        ...style,
      }}
    />
  );
}
