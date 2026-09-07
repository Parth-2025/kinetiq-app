export const SPACE = { xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const SIZE = { sm: 32, md: 40, lg: 48 } as const;
export type SpaceKey = keyof typeof SPACE;
