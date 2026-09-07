# KinetiQ UI Fluent Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace KinetiQ's hand-rolled light theme with one Fluent-2-derived design system (tokens, type ramp, icon set, primitives) and restructure every screen against it so the app reads as one product.

**Architecture:** A new `frontend/theme/` token layer exposes `useTheme()` (dark + light semantic colours built on the fixed 5-colour palette, a Fluent type ramp, 4px spacing, radius/elevation/motion). A curated `frontend/components/icons/` set wraps ~20 MIT `@fluentui/svg-icons` paths behind one `<Icon>`. A `frontend/components/ui/` primitive set (`Screen`, `AppBar`, `Text`, `Card`, `Button`, `Chip`, `Field`, `ListItem`, `Stat`/`StatGrid`, `ProgressBar`, `ScoreRing`, `EmptyState`, `InlineAlert`, `Divider`, `Skeleton`) composes those tokens. Navigation drops to 3 real tabs. Every screen is rewritten on the primitives; the old `constants/colors.ts` / `constants/theme.ts` and the Expo-starter component cruft are deleted last.

**Tech Stack:** Expo SDK 54, Expo Router 6, React Native 0.81, React 19, TypeScript `strict`, `react-native-reanimated` 4 (already present), `react-native-svg` (one new dep, `npx expo install`). No test runner.

**Spec:** `docs/superpowers/specs/2026-09-07-kinetiq-ui-fluent-rework-design.md` — read it alongside this plan. Where a screen's target layout is summarised here, the spec's per-screen table is the authority.

## Global Constraints

- All work stays on branch `ui-fluent-rework`, never `main`. Commits attributed to `Parth Mohan <parthmohan2006@gmail.com>`. Commit message trailers on every commit:
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_017KLgfxPWWY4vEMR2tfxMFy`
- Every task ends green on BOTH gates, run from `frontend/`:
  `npx tsc --noEmit` → **0 lines containing `error TS`**; `npx expo lint` → **exit 0, no new warnings**.
  (Use `npx` — a global legacy `expo-cli` on this machine shadows the local one and has no `lint`.)
- The one permitted new dependency is `react-native-svg`, added with `npx expo install react-native-svg`. No other new dependencies. `@fluentui/svg-icons` may be installed **temporarily as a devDependency** to copy path data in Task 2, then removed before that task's commit — it must not appear in `package.json` `dependencies` or `devDependencies` at rest.
- Runs identically on web and native. No platform-only components. `Platform.select` only for genuinely platform-specific values (fonts).
- The Auth0 PKCE flow, the auth guard in `app/(tabs)/_layout.tsx`, and every `useApiQuery` / `useApiMutation` / `apiFetch` / `useAuth` call site keep their current behaviour — only presentation changes. Do not touch `context/auth-context.tsx`, `config/api.ts`, `hooks/use-api.ts`, `services/kinetiq-api.ts`, or anything under `backend/`.
- Route paths other code links to are preserved: `/login`, `/auth/callback`, `/onboarding/username`, `/sports`, `/shot-breakdown`, `/phase-detail`, `/player-stats`, `/(tabs)`, `/(tabs)/upload`. `player-stats` becomes a `<Redirect>`, never a 404.
- Colour palette is fixed: `#11151C`, `#212D40`, `#364156`, `#7D4E57`, `#D66853`. Derived neutrals/status colours may be added; these five are the spine. After Phase 4 no file under `frontend/` (excluding `node_modules`) may import `@/constants/colors`, `@/constants/theme`, `MaterialIcons`, or `icon-symbol`, or reference a raw hex outside `theme/`.
- New files use `PascalCase.tsx` for components (`Screen.tsx`, `Icon.tsx`). Import primitives from `@/components/ui/<Name>`, icons from `@/components/icons/Icon`, theme from `@/theme`.

---

## File Structure

**Created**

| path | responsibility |
|---|---|
| `frontend/theme/tokens.ts` | `PALETTE` + `makeColors(mode)` → semantic `ColorSet`; `ColorToken` type |
| `frontend/theme/typography.ts` | `TYPE` ramp, `TypeVariant`, trimmed `Fonts` (`{ sans }`) |
| `frontend/theme/spacing.ts` | `SPACE` 4px scale, `SIZE` control heights, `SpaceKey` |
| `frontend/theme/radius.ts` | `RADIUS` corner radii |
| `frontend/theme/elevation.ts` | `ELEVATION` light-mode shadow objects |
| `frontend/theme/motion.ts` | `MOTION` durations + reanimated easing curves |
| `frontend/theme/index.ts` | `ThemeProvider`, `useTheme()`, `Theme` / `ThemeMode` / `ColorToken` re-exports |
| `frontend/components/icons/registry.tsx` | `IconName` union, `ICONS` map of 20 SVG components, `make()` helper |
| `frontend/components/icons/Icon.tsx` | `<Icon name size? color? hex? />` |
| `frontend/components/ui/Text.tsx` | the only text primitive |
| `frontend/components/ui/Screen.tsx` | safe-area page frame, optional scroll + app bar |
| `frontend/components/ui/AppBar.tsx` | pushed-screen top bar with back affordance |
| `frontend/components/ui/Card.tsx` | elevated/bordered surface, optional press |
| `frontend/components/ui/Button.tsx` | primary/secondary/subtle/outline × sm/md/lg |
| `frontend/components/ui/Chip.tsx` | pill, tone neutral/accent/success/danger |
| `frontend/components/ui/Divider.tsx` | 1px hairline |
| `frontend/components/ui/Field.tsx` | labelled text input with helper/error/state |
| `frontend/components/ui/ListItem.tsx` | row with leading icon / subtitle / trailing |
| `frontend/components/ui/InlineAlert.tsx` | in-body info/success/danger banner |
| `frontend/components/ui/EmptyState.tsx` | centred icon + title + body + optional action |
| `frontend/components/ui/Skeleton.tsx` | pulsing placeholder block |
| `frontend/components/ui/Stat.tsx` | single metric (`StatProps` exported here) |
| `frontend/components/ui/StatGrid.tsx` | 2-column grid of `Stat` |
| `frontend/components/ui/ProgressBar.tsx` | animated 0..1 bar |
| `frontend/components/ui/ScoreRing.tsx` | svg ring + `toneForScore` helper |
| `frontend/app/(tabs)/profile.tsx` | Profile tab (player-stats content, re-skinned) |

**Modified**

`frontend/app/_layout.tsx`, `frontend/app/(tabs)/_layout.tsx`, `frontend/app/(tabs)/index.tsx`, `frontend/app/(tabs)/upload.tsx`, `frontend/app/(tabs)/leaderboard.tsx`, `frontend/app/(tabs)/messages.tsx`, `frontend/app/(tabs)/shop.tsx`, `frontend/app/login.tsx`, `frontend/app/auth/callback.tsx`, `frontend/app/onboarding/username.tsx`, `frontend/app/shot-breakdown.tsx`, `frontend/app/phase-detail.tsx`, `frontend/app/sports.tsx`, `frontend/app/player-stats.tsx`, `frontend/app/friends/add.tsx`, `frontend/app/messages/[friendId].tsx`, `frontend/app/messages/new.tsx`, `frontend/package.json`.

**Deleted (Phase 4)**

`frontend/constants/colors.ts`, `frontend/constants/theme.ts`,
`frontend/app/modal.tsx`, `frontend/app/(tabs)/explore.tsx`,
`frontend/components/coming-soon.tsx`, `frontend/components/hello-wave.tsx`,
`frontend/components/parallax-scroll-view.tsx`, `frontend/components/themed-text.tsx`,
`frontend/components/themed-view.tsx`, `frontend/components/external-link.tsx`,
`frontend/components/profile-cosmetics.tsx`,
`frontend/components/ui/icon-symbol.tsx`, `frontend/components/ui/icon-symbol.ios.tsx`,
`frontend/components/ui/collapsible.tsx`,
`frontend/hooks/use-theme-color.ts`, `frontend/hooks/use-profile-customization.ts`.

**Kept as-is**

`frontend/components/haptic-tab.tsx` (used by tab bar), `frontend/hooks/use-color-scheme*.ts`,
`frontend/hooks/use-user-profile.ts`, `frontend/hooks/use-user-stats.ts`, `frontend/hooks/use-api.ts`,
`frontend/hooks/use-social-inbox.ts` (already orphaned; imports nothing that trips the grep gate — leave it),
`frontend/utils/analysis.ts`, `frontend/services/user-profile.ts`, `frontend/types/*`.

> **Decomposition note — deletions beyond the spec's explicit list.** The spec names most deletions. Three more are forced by the gates and are folded into Phase 4: `components/ui/collapsible.tsx` (imports the deleted `themed-text`/`themed-view`/`icon-symbol`; only consumer was `explore.tsx`), `hooks/use-theme-color.ts` (imports `@/constants/theme` → trips the grep gate; only consumers were the deleted themed-* / parallax files), `components/external-link.tsx` (only consumer was `explore.tsx`), `components/profile-cosmetics.tsx` + `hooks/use-profile-customization.ts` (`profile-cosmetics` imports `MaterialIcons` → trips the grep gate; both only consumed by the old Home screen, which Task 12 rewrites to drop cosmetics). `constants/theme.ts` is deletable only after `explore.tsx` (its sole remaining `Fonts` consumer) is gone.

---

## Phase 1 — Foundation

### Task 1: Theme token layer + provider

**Files:**
- Modify: `frontend/package.json` (via `npx expo install react-native-svg`)
- Create: `frontend/theme/tokens.ts`, `frontend/theme/typography.ts`, `frontend/theme/spacing.ts`, `frontend/theme/radius.ts`, `frontend/theme/elevation.ts`, `frontend/theme/motion.ts`, `frontend/theme/index.ts`
- Modify: `frontend/app/_layout.tsx` (mount `<ThemeProvider>` only — no other changes this task)

**Interfaces:**
- Consumes: `useColorScheme` from `react-native`; `Easing` from `react-native-reanimated`.
- Produces:
  - `PALETTE` (const object), `makeColors(mode: "dark" | "light"): ColorSet`, `type ColorSet`, `type ColorToken = keyof ColorSet` — from `theme/tokens.ts`.
  - `TYPE` (record), `type TypeVariant = keyof typeof TYPE`, `Fonts: { sans: string }` — from `theme/typography.ts`.
  - `SPACE`, `SIZE`, `type SpaceKey = keyof typeof SPACE` — from `theme/spacing.ts`.
  - `RADIUS` — from `theme/radius.ts`.
  - `ELEVATION` (`shadow2`/`shadow4`/`shadow8`/`shadow16`, each an RN shadow style object) — from `theme/elevation.ts`.
  - `MOTION` (`durationFast`/`durationNormal`/`durationSlow` numbers, `curveDecel`/`curveStandard` easing fns) — from `theme/motion.ts`.
  - `ThemeProvider`, `useTheme(): Theme`, `type Theme`, `type ThemeMode`, `type ColorToken` — from `theme/index.ts`.
  - `Theme` shape: `{ mode: ThemeMode; color: ColorSet; type: typeof TYPE; fonts: { sans: string }; space: typeof SPACE; size: typeof SIZE; radius: typeof RADIUS; elevation: typeof ELEVATION; motion: typeof MOTION; setThemeOverride: (m: ThemeMode | null) => void }`.

- [ ] **Step 1: Install `react-native-svg`**

Run: `cd frontend && npx expo install react-native-svg`
Expected: `react-native-svg` added to `package.json` `dependencies` at the SDK-54-compatible version (`~15.12.x`). No lockfile is committed here (repo has none for frontend); just the `package.json` change.

- [ ] **Step 2: `theme/tokens.ts`**

```ts
export const PALETTE = {
  ink: "#11151C",
  slate: "#212D40",
  steel: "#364156",
  rose: "#7D4E57",
  terracotta: "#D66853",
} as const;

export type ColorSet = {
  bg: string;
  layer: string;
  layerAlt: string;
  stroke: string;
  strokeSoft: string;
  text: string;
  textSecondary: string;
  textDisabled: string;
  accent: string;
  accentHover: string;
  accentPressed: string;
  accentSubtle: string;
  onAccent: string;
  secondary: string;
  secondarySubtle: string;
  success: string;
  successSubtle: string;
  danger: string;
  dangerSubtle: string;
  overlay: string;
};

export type ColorToken = keyof ColorSet;

const DARK: ColorSet = {
  bg: "#11151C",
  layer: "#212D40",
  layerAlt: "#1A2231",
  stroke: "#364156",
  strokeSoft: "#2A3444",
  text: "#F3F5F8",
  textSecondary: "#9FB0C3",
  textDisabled: "#5C6B7E",
  accent: "#D66853",
  accentHover: "#E07C69",
  accentPressed: "#BF5745",
  accentSubtle: "#2A2028",
  onAccent: "#FFFFFF",
  secondary: "#7D4E57",
  secondarySubtle: "#241D20",
  success: "#3FB984",
  successSubtle: "#16241F",
  danger: "#E5686D",
  dangerSubtle: "#2A1B1C",
  overlay: "rgba(9,12,17,0.6)",
};

const LIGHT: ColorSet = {
  bg: "#F5F6F8",
  layer: "#FFFFFF",
  layerAlt: "#EEF1F4",
  stroke: "#E1E5EA",
  strokeSoft: "#EEF1F4",
  text: "#11151C",
  textSecondary: "#5A6B7D",
  textDisabled: "#A6B0BB",
  accent: "#D66853",
  accentHover: "#C25642",
  accentPressed: "#AC4A38",
  accentSubtle: "#FBEEEA",
  onAccent: "#FFFFFF",
  secondary: "#7D4E57",
  secondarySubtle: "#F6EEF0",
  success: "#1F9D6B",
  successSubtle: "#E7F6EF",
  danger: "#D64550",
  dangerSubtle: "#FBEBEC",
  overlay: "rgba(17,21,28,0.35)",
};

export function makeColors(mode: "dark" | "light"): ColorSet {
  return mode === "dark" ? DARK : LIGHT;
}
```

- [ ] **Step 3: `theme/typography.ts`**

```ts
import { Platform, type TextStyle } from "react-native";

type TypeEntry = {
  fontSize: number;
  lineHeight: number;
  fontWeight: TextStyle["fontWeight"];
};

export const TYPE = {
  caption1: { fontSize: 12, lineHeight: 16, fontWeight: "400" },
  caption1Strong: { fontSize: 12, lineHeight: 16, fontWeight: "600" },
  body1: { fontSize: 15, lineHeight: 20, fontWeight: "400" },
  body1Strong: { fontSize: 15, lineHeight: 20, fontWeight: "600" },
  subtitle1: { fontSize: 18, lineHeight: 24, fontWeight: "600" },
  title3: { fontSize: 20, lineHeight: 26, fontWeight: "700" },
  title2: { fontSize: 24, lineHeight: 30, fontWeight: "700" },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: "700" },
  display: { fontSize: 34, lineHeight: 40, fontWeight: "700" },
} satisfies Record<string, TypeEntry>;

export type TypeVariant = keyof typeof TYPE;

export const Fonts = Platform.select({
  ios: { sans: "system-ui" },
  default: { sans: "normal" },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
}) as { sans: string };
```

- [ ] **Step 4: `theme/spacing.ts`**

```ts
export const SPACE = { xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const SIZE = { sm: 32, md: 40, lg: 48 } as const;
export type SpaceKey = keyof typeof SPACE;
```

- [ ] **Step 5: `theme/radius.ts`**

```ts
export const RADIUS = { s: 4, m: 6, l: 8, xl: 12, circular: 999 } as const;
```

- [ ] **Step 6: `theme/elevation.ts`**

```ts
import type { ViewStyle } from "react-native";

type Shadow = Pick<
  ViewStyle,
  "shadowColor" | "shadowOpacity" | "shadowRadius" | "shadowOffset" | "elevation"
>;

export const ELEVATION = {
  shadow2: { shadowColor: "#0B1220", shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  shadow4: { shadowColor: "#0B1220", shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  shadow8: { shadowColor: "#0B1220", shadowOpacity: 0.1, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  shadow16: { shadowColor: "#0B1220", shadowOpacity: 0.14, shadowRadius: 28, shadowOffset: { width: 0, height: 14 }, elevation: 16 },
} satisfies Record<string, Shadow>;
```

- [ ] **Step 7: `theme/motion.ts`**

```ts
import { Easing } from "react-native-reanimated";

export const MOTION = {
  durationFast: 100,
  durationNormal: 200,
  durationSlow: 300,
  curveDecel: Easing.out(Easing.cubic),
  curveStandard: Easing.inOut(Easing.cubic),
} as const;
```

- [ ] **Step 8: `theme/index.ts`**

```tsx
import React, { createContext, useContext, useMemo, useState } from "react";
import { useColorScheme } from "react-native";

import { makeColors, type ColorSet } from "./tokens";
import { TYPE, Fonts } from "./typography";
import { SPACE, SIZE } from "./spacing";
import { RADIUS } from "./radius";
import { ELEVATION } from "./elevation";
import { MOTION } from "./motion";

export type { ColorToken, ColorSet } from "./tokens";
export type { TypeVariant } from "./typography";
export type { SpaceKey } from "./spacing";

export type ThemeMode = "dark" | "light";

export type Theme = {
  mode: ThemeMode;
  color: ColorSet;
  type: typeof TYPE;
  fonts: { sans: string };
  space: typeof SPACE;
  size: typeof SIZE;
  radius: typeof RADIUS;
  elevation: typeof ELEVATION;
  motion: typeof MOTION;
  setThemeOverride: (mode: ThemeMode | null) => void;
};

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [override, setOverride] = useState<ThemeMode | null>(null);
  const mode: ThemeMode = override ?? (system === "dark" ? "dark" : "light");

  const value = useMemo<Theme>(
    () => ({
      mode,
      color: makeColors(mode),
      type: TYPE,
      fonts: Fonts,
      space: SPACE,
      size: SIZE,
      radius: RADIUS,
      elevation: ELEVATION,
      motion: MOTION,
      setThemeOverride: setOverride,
    }),
    [mode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
```

- [ ] **Step 9: Mount the provider in `app/_layout.tsx`**

Only add the wrapper — leave the `@react-navigation/native` `ThemeProvider`, the `<Stack>` entries, and `<StatusBar>` exactly as they are (Task 6 rewrites them). Add `import { ThemeProvider } from "@/theme";` and wrap:

```tsx
  return (
    <AuthProvider>
      <ThemeProvider>
        {/* existing @react-navigation ThemeProvider + Stack + StatusBar unchanged */}
      </ThemeProvider>
    </AuthProvider>
  );
```

There will be two symbols named `ThemeProvider` in scope. Alias the navigation one at its import to avoid the clash: `import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from "@react-navigation/native";` and rename its single JSX usage to `<NavigationThemeProvider …>`. Nothing else changes.

- [ ] **Step 10: Gate**

Run: `cd frontend && npx tsc --noEmit && npx expo lint`
Expected: no `error TS` lines; lint exit 0. `npx expo start --web` boots to the login screen unchanged (the provider is inert until primitives consume it).

- [ ] **Step 11: Commit**

```bash
git add frontend/theme frontend/app/_layout.tsx frontend/package.json
git commit -m "feat(ui): add Fluent theme token layer + ThemeProvider

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017KLgfxPWWY4vEMR2tfxMFy"
```

---

### Task 2: Icon set

**Files:**
- Create: `frontend/components/icons/registry.tsx`, `frontend/components/icons/Icon.tsx`
- Modify (temporary): `frontend/package.json` — add then remove `@fluentui/svg-icons`

**Interfaces:**
- Consumes: `useTheme` from `@/theme`; `Svg`, `Path` from `react-native-svg`.
- Produces:
  - `type IconName` (20-member string union, listed below) and `ICONS: Record<IconName, React.FC<{ size: number; color: string }>>` — from `registry.tsx`.
  - `Icon` component: `<Icon name={IconName} size?={number /* 20 */} color?={ColorToken /* "text" */} hex?={string} />` — from `Icon.tsx`. `hex` overrides the token (used by the tab bar, which supplies its own active/inactive colour).

- [ ] **Step 1: Temporarily add the icon source package**

Run: `cd frontend && npm install --save-dev @fluentui/svg-icons`
This is a build-time source of path data only. It is removed in Step 5.

- [ ] **Step 2: `components/icons/registry.tsx`**

```tsx
import * as React from "react";
import Svg, { Path } from "react-native-svg";

export type IconName =
  | "home"
  | "arrow-upload"
  | "camera"
  | "image"
  | "chevron-left"
  | "chevron-right"
  | "person"
  | "trophy"
  | "chart"
  | "basketball"
  | "checkmark-circle"
  | "dismiss"
  | "warning"
  | "info"
  | "history"
  | "settings"
  | "sign-out"
  | "sparkle"
  | "play"
  | "lock";

type IconComponent = React.FC<{ size: number; color: string }>;

type PathSpec = string | { d: string; fillRule: "evenodd" | "nonzero" };

// Path `d` values below are copied verbatim from the MIT-licensed
// @fluentui/svg-icons package (20px "regular" variant). See the mapping table
// in the plan for the source file of each icon. Most 20px regular icons are a
// single path; when the source file has multiple <path> elements, list them all.
function make(paths: PathSpec[]): IconComponent {
  const Component: IconComponent = ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      {paths.map((p, i) => {
        const d = typeof p === "string" ? p : p.d;
        const fillRule = typeof p === "string" ? undefined : p.fillRule;
        return <Path key={i} d={d} fill={color} fillRule={fillRule} />;
      })}
    </Svg>
  );
  return Component;
}

export const ICONS: Record<IconName, IconComponent> = {
  // Replace every "<d …>" with the actual `d` attribute value from the source
  // file named in the mapping table. Example shape of a real entry:
  //   "chevron-left": make(["M12.35 15.35a.5.5 0 0 1-.7 0L6.3 10l5.35-5.35a.5.5 0 0 1 .7.7L7.4 10l4.95 4.65a.5.5 0 0 1 0 .7Z"]),
  home: make(["<d ic_fluent_home_20_regular>"]),
  "arrow-upload": make(["<d ic_fluent_arrow_upload_20_regular>"]),
  camera: make(["<d ic_fluent_camera_20_regular>"]),
  image: make(["<d ic_fluent_image_20_regular>"]),
  "chevron-left": make(["<d ic_fluent_chevron_left_20_regular>"]),
  "chevron-right": make(["<d ic_fluent_chevron_right_20_regular>"]),
  person: make(["<d ic_fluent_person_20_regular>"]),
  trophy: make(["<d ic_fluent_trophy_20_regular>"]),
  chart: make(["<d ic_fluent_data_bar_vertical_20_regular>"]),
  basketball: make(["<d ic_fluent_sport_basketball_20_regular>"]),
  "checkmark-circle": make(["<d ic_fluent_checkmark_circle_20_regular>"]),
  dismiss: make(["<d ic_fluent_dismiss_20_regular>"]),
  warning: make(["<d ic_fluent_warning_20_regular>"]),
  info: make(["<d ic_fluent_info_20_regular>"]),
  history: make(["<d ic_fluent_history_20_regular>"]),
  settings: make(["<d ic_fluent_settings_20_regular>"]),
  "sign-out": make(["<d ic_fluent_sign_out_20_regular>"]),
  sparkle: make(["<d ic_fluent_sparkle_20_regular>"]),
  play: make(["<d ic_fluent_play_20_regular>"]),
  lock: make(["<d ic_fluent_lock_closed_20_regular>"]),
};
```

**Mapping table — `IconName` → source file under `node_modules/@fluentui/svg-icons/icons/`:**

| IconName | source file (20px regular) |
|---|---|
| `home` | `ic_fluent_home_20_regular.svg` |
| `arrow-upload` | `ic_fluent_arrow_upload_20_regular.svg` |
| `camera` | `ic_fluent_camera_20_regular.svg` |
| `image` | `ic_fluent_image_20_regular.svg` |
| `chevron-left` | `ic_fluent_chevron_left_20_regular.svg` |
| `chevron-right` | `ic_fluent_chevron_right_20_regular.svg` |
| `person` | `ic_fluent_person_20_regular.svg` |
| `trophy` | `ic_fluent_trophy_20_regular.svg` |
| `chart` | `ic_fluent_data_bar_vertical_20_regular.svg` |
| `basketball` | `ic_fluent_sport_basketball_20_regular.svg` |
| `checkmark-circle` | `ic_fluent_checkmark_circle_20_regular.svg` |
| `dismiss` | `ic_fluent_dismiss_20_regular.svg` |
| `warning` | `ic_fluent_warning_20_regular.svg` |
| `info` | `ic_fluent_info_20_regular.svg` |
| `history` | `ic_fluent_history_20_regular.svg` |
| `settings` | `ic_fluent_settings_20_regular.svg` |
| `sign-out` | `ic_fluent_sign_out_20_regular.svg` |
| `sparkle` | `ic_fluent_sparkle_20_regular.svg` |
| `play` | `ic_fluent_play_20_regular.svg` |
| `lock` | `ic_fluent_lock_closed_20_regular.svg` |

For each: open the file, copy the value of every `<path … d="…">` attribute (and `fill-rule` if present — pass `{ d, fillRule: "evenodd" }`), drop the `fill` attribute (the component supplies `fill`). If an exact filename above does not exist in the installed version, pick the nearest same-concept `*_20_regular.svg` in that directory and note the substitution in the task report.

- [ ] **Step 3: `components/icons/Icon.tsx`**

```tsx
import { useTheme, type ColorToken } from "@/theme";
import { ICONS, type IconName } from "./registry";

export function Icon({
  name,
  size = 20,
  color = "text",
  hex,
}: {
  name: IconName;
  size?: number;
  color?: ColorToken;
  hex?: string;
}) {
  const t = useTheme();
  const Cmp = ICONS[name];
  return <Cmp size={size} color={hex ?? t.color[color]} />;
}
```

- [ ] **Step 4: Verify every icon renders**

Add a temporary scratch route `frontend/app/_iconcheck.tsx` that maps over every `IconName` and renders `<Icon name={n} size={28} />` in a wrapped row inside a `<View>` with `backgroundColor` from `useTheme().color.bg`. Run `npx expo start --web`, open `/_iconcheck`, confirm all 20 glyphs draw (no empty boxes, no console errors), in both OS appearances. **Delete `frontend/app/_iconcheck.tsx` before committing.**

- [ ] **Step 5: Remove the source package**

Run: `cd frontend && npm uninstall @fluentui/svg-icons`
Confirm `@fluentui/svg-icons` is absent from `package.json`. `git diff package.json` should show only the `react-native-svg` line from Task 1 (already committed) — i.e. no net change to `package.json` in this task.

- [ ] **Step 6: Gate**

Run: `cd frontend && npx tsc --noEmit && npx expo lint`
Expected: no `error TS`; lint exit 0. `git status` shows only `components/icons/registry.tsx` and `components/icons/Icon.tsx` as new files.

- [ ] **Step 7: Commit**

```bash
git add frontend/components/icons
git commit -m "feat(ui): add curated Fluent SVG icon set + <Icon>

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017KLgfxPWWY4vEMR2tfxMFy"
```

---

### Task 3: Primitives — layout & text core

**Files:**
- Create: `frontend/components/ui/Text.tsx`, `frontend/components/ui/Screen.tsx`, `frontend/components/ui/Card.tsx`, `frontend/components/ui/Divider.tsx`, `frontend/components/ui/Button.tsx`, `frontend/components/ui/Chip.tsx`

**Interfaces:**
- Consumes: `useTheme`, `ColorToken`, `SpaceKey`, `TypeVariant` from `@/theme`; `Icon`, `IconName` from `@/components/icons`.
- Produces (import as `@/components/ui/<Name>`):
  - `Text` — `{ children; variant?: TypeVariant /* "body1" */; color?: ColorToken /* "text" */; weight?: TextStyle["fontWeight"]; numberOfLines?: number; align?: TextStyle["textAlign"]; style?: StyleProp<TextStyle> }`
  - `Screen` — `{ children; scroll?: boolean; appBar?: ReactNode; pad?: boolean /* true */; contentStyle?: StyleProp<ViewStyle> }`
  - `Card` — `{ children; onPress?: () => void; pad?: SpaceKey /* "l" */; style?: StyleProp<ViewStyle> }`
  - `Divider` — `{ inset?: number /* 0 */ }`
  - `Button` — `{ label: string; onPress: () => void; appearance?: "primary"|"secondary"|"subtle"|"outline" /* "primary" */; size?: "sm"|"md"|"lg" /* "md" */; icon?: IconName; loading?: boolean; disabled?: boolean; fullWidth?: boolean }`
  - `Chip` — `{ label: string; tone?: "neutral"|"accent"|"success"|"danger" /* "neutral" */; dot?: boolean }`

- [ ] **Step 1: `Text.tsx`**

```tsx
import type { ReactNode } from "react";
import { Text as RNText, type StyleProp, type TextStyle } from "react-native";

import { useTheme, type ColorToken, type TypeVariant } from "@/theme";

type Props = {
  children: ReactNode;
  variant?: TypeVariant;
  color?: ColorToken;
  weight?: TextStyle["fontWeight"];
  numberOfLines?: number;
  align?: TextStyle["textAlign"];
  style?: StyleProp<TextStyle>;
};

export function Text({
  children,
  variant = "body1",
  color = "text",
  weight,
  numberOfLines,
  align,
  style,
}: Props) {
  const t = useTheme();
  return (
    <RNText
      numberOfLines={numberOfLines}
      style={[
        t.type[variant],
        { color: t.color[color], fontFamily: t.fonts.sans },
        weight ? { fontWeight: weight } : null,
        align ? { textAlign: align } : null,
        style,
      ]}
    >
      {children}
    </RNText>
  );
}
```

- [ ] **Step 2: `Screen.tsx`**

```tsx
import type { ReactNode } from "react";
import { ScrollView, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/theme";

type Props = {
  children: ReactNode;
  scroll?: boolean;
  appBar?: ReactNode;
  pad?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
};

export function Screen({ children, scroll, appBar, pad = true, contentStyle }: Props) {
  const t = useTheme();
  const padStyle = pad ? { paddingHorizontal: t.space.l } : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.color.bg }} edges={["top"]}>
      {appBar}
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            padStyle,
            { paddingTop: t.space.l, paddingBottom: t.space.xxxl },
            contentStyle,
          ]}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, padStyle, { paddingTop: t.space.l }, contentStyle]}>
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}
```

- [ ] **Step 3: `Card.tsx`**

```tsx
import type { ReactNode } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme, type SpaceKey } from "@/theme";

type Props = {
  children: ReactNode;
  onPress?: () => void;
  pad?: SpaceKey;
  style?: StyleProp<ViewStyle>;
};

export function Card({ children, onPress, pad = "l", style }: Props) {
  const t = useTheme();
  const base: ViewStyle = {
    backgroundColor: t.color.layer,
    borderRadius: t.radius.xl,
    padding: t.space[pad],
    ...(t.mode === "light"
      ? t.elevation.shadow4
      : { borderWidth: 1, borderColor: t.color.stroke }),
  };

  if (!onPress) return <View style={[base, style]}>{children}</View>;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        base,
        pressed ? { opacity: 0.92, transform: [{ scale: 0.99 }] } : null,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}
```

- [ ] **Step 4: `Divider.tsx`**

```tsx
import { View } from "react-native";

import { useTheme } from "@/theme";

export function Divider({ inset = 0 }: { inset?: number }) {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.color.stroke, marginLeft: inset }} />;
}
```

- [ ] **Step 5: `Button.tsx`**

```tsx
import { ActivityIndicator, Pressable, type ViewStyle } from "react-native";

import { useTheme, type ColorToken } from "@/theme";
import { Icon } from "@/components/icons/Icon";
import type { IconName } from "@/components/icons/registry";
import { Text } from "./Text";

type Props = {
  label: string;
  onPress: () => void;
  appearance?: "primary" | "secondary" | "subtle" | "outline";
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
};

export function Button({
  label,
  onPress,
  appearance = "primary",
  size = "md",
  icon,
  loading,
  disabled,
  fullWidth,
}: Props) {
  const t = useTheme();
  const isDisabled = disabled || loading;

  const bg =
    appearance === "primary"
      ? t.color.accent
      : appearance === "secondary"
        ? t.color.secondary
        : "transparent";
  const fg: ColorToken =
    appearance === "primary" || appearance === "secondary"
      ? "onAccent"
      : appearance === "subtle"
        ? "accent"
        : "text";
  const border: ViewStyle =
    appearance === "outline" ? { borderWidth: 1, borderColor: t.color.stroke } : {};

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        {
          height: t.size[size],
          borderRadius: t.radius.l,
          paddingHorizontal: t.space.l,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: t.space.s,
          backgroundColor: bg,
          alignSelf: fullWidth ? "stretch" : "flex-start",
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
        },
        border,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={t.color[fg]} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={18} color={fg} /> : null}
          <Text variant="body1Strong" color={fg}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
```

- [ ] **Step 6: `Chip.tsx`**

```tsx
import { View } from "react-native";

import { useTheme, type ColorToken } from "@/theme";
import { Text } from "./Text";

type Tone = "neutral" | "accent" | "success" | "danger";

export function Chip({ label, tone = "neutral", dot }: { label: string; tone?: Tone; dot?: boolean }) {
  const t = useTheme();
  const bg: ColorToken = tone === "neutral" ? "layerAlt" : (`${tone}Subtle` as ColorToken);
  const fg: ColorToken = tone === "neutral" ? "textSecondary" : tone;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: t.space.xs,
        backgroundColor: t.color[bg],
        borderRadius: t.radius.circular,
        paddingVertical: t.space.xs,
        paddingHorizontal: t.space.m,
      }}
    >
      {dot ? (
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.color[fg] }} />
      ) : null}
      <Text variant="caption1Strong" color={fg}>
        {label}
      </Text>
    </View>
  );
}
```

- [ ] **Step 7: Gate**

Run: `cd frontend && npx tsc --noEmit && npx expo lint`
Expected: no `error TS`; lint exit 0.

- [ ] **Step 8: Commit**

```bash
git add frontend/components/ui
git commit -m "feat(ui): add layout + text primitives (Screen, Text, Card, Button, Chip, Divider)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017KLgfxPWWY4vEMR2tfxMFy"
```

---

### Task 4: Primitives — bars, rows, inputs, states

**Files:**
- Create: `frontend/components/ui/AppBar.tsx`, `frontend/components/ui/ListItem.tsx`, `frontend/components/ui/Field.tsx`, `frontend/components/ui/InlineAlert.tsx`, `frontend/components/ui/EmptyState.tsx`, `frontend/components/ui/Skeleton.tsx`

**Interfaces:**
- Consumes: `useTheme`, `ColorToken` from `@/theme`; `Icon`, `IconName` from `@/components/icons`; `Text` from `@/components/ui/Text`; `Button` from `@/components/ui/Button`; reanimated (`Animated`, `useSharedValue`, `useAnimatedStyle`, `withRepeat`, `withSequence`, `withTiming`).
- Produces (import as `@/components/ui/<Name>`):
  - `AppBar` — `{ title: string; onBack?: () => void; trailing?: ReactNode }`
  - `ListItem` — `{ title: string; subtitle?: string; leading?: IconName | ReactNode; trailing?: "chevron" | ReactNode; onPress?: () => void; divider?: boolean }`
  - `Field` — `{ label: string; value: string; onChangeText: (t: string) => void; placeholder?: string; helper?: string; error?: string; state?: "default"|"error"|"success"; autoCapitalize?: "none"|"sentences"|"words"|"characters"; autoCorrect?: boolean; maxLength?: number; editable?: boolean; prefix?: string; onSubmitEditing?: () => void }`
  - `InlineAlert` — `{ tone: "info"|"success"|"danger"; title?: string; message: string; onDismiss?: () => void; action?: { label: string; onPress: () => void } }`
  - `EmptyState` — `{ icon: IconName; title: string; body?: string; action?: { label: string; onPress: () => void } }`
  - `Skeleton` — `{ width: number | \`${number}%\`; height: number; radius?: number }`

- [ ] **Step 1: `AppBar.tsx`**

```tsx
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { useTheme } from "@/theme";
import { Icon } from "@/components/icons/Icon";
import { Text } from "./Text";

type Props = { title: string; onBack?: () => void; trailing?: ReactNode };

export function AppBar({ title, onBack, trailing }: Props) {
  const t = useTheme();
  return (
    <View
      style={{
        height: 52,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: t.space.s,
        backgroundColor: t.color.bg,
        borderBottomWidth: 1,
        borderBottomColor: t.color.stroke,
      }}
    >
      <View style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={8}
            style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
          >
            <Icon name="chevron-left" size={24} color="text" />
          </Pressable>
        ) : null}
      </View>
      <Text variant="title3" numberOfLines={1} style={{ flex: 1 }}>
        {title}
      </Text>
      <View style={{ minWidth: 40, alignItems: "flex-end" }}>{trailing}</View>
    </View>
  );
}
```

- [ ] **Step 2: `ListItem.tsx`**

```tsx
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { useTheme } from "@/theme";
import { Icon } from "@/components/icons/Icon";
import type { IconName } from "@/components/icons/registry";
import { Text } from "./Text";

type Props = {
  title: string;
  subtitle?: string;
  leading?: IconName | ReactNode;
  trailing?: "chevron" | ReactNode;
  onPress?: () => void;
  divider?: boolean;
};

export function ListItem({ title, subtitle, leading, trailing, onPress, divider }: Props) {
  const t = useTheme();

  const body = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: t.space.m,
        minHeight: 56,
        paddingVertical: t.space.m,
        borderBottomWidth: divider ? 1 : 0,
        borderBottomColor: t.color.stroke,
      }}
    >
      {typeof leading === "string" ? (
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: t.color.accentSubtle,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={leading as IconName} size={20} color="accent" />
        </View>
      ) : (
        (leading as ReactNode) ?? null
      )}
      <View style={{ flex: 1 }}>
        <Text variant="body1Strong" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption1" color="textSecondary" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing === "chevron" ? (
        <Icon name="chevron-right" size={20} color="textSecondary" />
      ) : (
        (trailing as ReactNode) ?? null
      )}
    </View>
  );

  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}>
      {body}
    </Pressable>
  ) : (
    body
  );
}
```

- [ ] **Step 3: `Field.tsx`**

```tsx
import { useState } from "react";
import { TextInput, View } from "react-native";

import { useTheme, type ColorToken } from "@/theme";
import { Text } from "./Text";

type Props = {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  helper?: string;
  error?: string;
  state?: "default" | "error" | "success";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
  maxLength?: number;
  editable?: boolean;
  prefix?: string;
  onSubmitEditing?: () => void;
};

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  helper,
  error,
  state = "default",
  autoCapitalize,
  autoCorrect,
  maxLength,
  editable = true,
  prefix,
  onSubmitEditing,
}: Props) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const effState = error ? "error" : state;

  const underline: ColorToken = focused
    ? "accent"
    : effState === "error"
      ? "danger"
      : effState === "success"
        ? "success"
        : "stroke";
  const msg = error ?? helper;
  const msgColor: ColorToken = error ? "danger" : effState === "success" ? "success" : "textSecondary";

  return (
    <View style={{ gap: t.space.xs }}>
      <Text variant="caption1Strong" color="textSecondary">
        {label}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: t.space.xs,
          backgroundColor: t.color.layerAlt,
          borderRadius: t.radius.m,
          height: 44,
          paddingHorizontal: t.space.m,
          borderBottomWidth: 1.5,
          borderBottomColor: t.color[underline],
        }}
      >
        {prefix ? (
          <Text variant="body1" color="textSecondary">
            {prefix}
          </Text>
        ) : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={t.color.textDisabled}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          maxLength={maxLength}
          editable={editable}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={onSubmitEditing}
          style={{ flex: 1, color: t.color.text, fontFamily: t.fonts.sans, fontSize: 15 }}
        />
      </View>
      {msg ? (
        <Text variant="caption1" color={msgColor}>
          {msg}
        </Text>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 4: `InlineAlert.tsx`**

```tsx
import { Pressable, View } from "react-native";

import { useTheme, type ColorToken } from "@/theme";
import { Icon } from "@/components/icons/Icon";
import type { IconName } from "@/components/icons/registry";
import { Text } from "./Text";

type Tone = "info" | "success" | "danger";

const TONE_ICON: Record<Tone, IconName> = {
  info: "info",
  success: "checkmark-circle",
  danger: "warning",
};

type Props = {
  tone: Tone;
  title?: string;
  message: string;
  onDismiss?: () => void;
  action?: { label: string; onPress: () => void };
};

export function InlineAlert({ tone, title, message, onDismiss, action }: Props) {
  const t = useTheme();
  const subtle: ColorToken = `${tone}Subtle` as ColorToken;

  return (
    <View
      style={{
        flexDirection: "row",
        gap: t.space.s,
        backgroundColor: t.color[subtle],
        borderLeftWidth: 3,
        borderLeftColor: t.color[tone],
        borderRadius: t.radius.m,
        padding: t.space.m,
      }}
    >
      <Icon name={TONE_ICON[tone]} size={18} color={tone} />
      <View style={{ flex: 1, gap: t.space.xs }}>
        {title ? (
          <Text variant="body1Strong" color={tone}>
            {title}
          </Text>
        ) : null}
        <Text variant="caption1" color="text">
          {message}
        </Text>
        {action ? (
          <Pressable onPress={action.onPress} hitSlop={8}>
            <Text variant="caption1Strong" color={tone}>
              {action.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {onDismiss ? (
        <Pressable onPress={onDismiss} hitSlop={8}>
          <Icon name="dismiss" size={16} color="textSecondary" />
        </Pressable>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 5: `EmptyState.tsx`**

```tsx
import { View } from "react-native";

import { useTheme } from "@/theme";
import { Icon } from "@/components/icons/Icon";
import type { IconName } from "@/components/icons/registry";
import { Text } from "./Text";
import { Button } from "./Button";

type Props = {
  icon: IconName;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void };
};

export function EmptyState({ icon, title, body, action }: Props) {
  const t = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: t.space.l,
        paddingHorizontal: t.space.xl,
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: t.color.layerAlt,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={icon} size={28} color="textSecondary" />
      </View>
      <Text variant="title3" align="center">
        {title}
      </Text>
      {body ? (
        <Text variant="body1" color="textSecondary" align="center">
          {body}
        </Text>
      ) : null}
      {action ? <Button label={action.label} onPress={action.onPress} appearance="secondary" /> : null}
    </View>
  );
}
```

- [ ] **Step 6: `Skeleton.tsx`**

```tsx
import { useEffect } from "react";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/theme";

type Props = { width: number | `${number}%`; height: number; radius?: number };

export function Skeleton({ width, height, radius }: Props) {
  const t = useTheme();
  const o = useSharedValue(0.4);

  useEffect(() => {
    o.value = withRepeat(
      withSequence(withTiming(0.8, { duration: 600 }), withTiming(0.4, { duration: 600 })),
      -1,
      true,
    );
  }, [o]);

  const style = useAnimatedStyle(() => ({ opacity: o.value }));

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius ?? t.radius.m, backgroundColor: t.color.layerAlt },
        style,
      ]}
    />
  );
}
```

- [ ] **Step 7: Gate**

Run: `cd frontend && npx tsc --noEmit && npx expo lint`
Expected: no `error TS`; lint exit 0.

- [ ] **Step 8: Commit**

```bash
git add frontend/components/ui
git commit -m "feat(ui): add AppBar, ListItem, Field, InlineAlert, EmptyState, Skeleton primitives

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017KLgfxPWWY4vEMR2tfxMFy"
```

---

### Task 5: Primitives — data viz

**Files:**
- Create: `frontend/components/ui/Stat.tsx`, `frontend/components/ui/StatGrid.tsx`, `frontend/components/ui/ProgressBar.tsx`, `frontend/components/ui/ScoreRing.tsx`

**Interfaces:**
- Consumes: `useTheme`, `ColorToken` from `@/theme`; `Text` from `@/components/ui/Text`; `Card` from `@/components/ui/Card`; `Svg`, `Circle` from `react-native-svg`; reanimated.
- Produces (import as `@/components/ui/<Name>`):
  - `Stat` + `type StatProps` — `{ value: string; label: string; delta?: string; deltaTone?: "success"|"danger"|"neutral" }`
  - `StatGrid` — `{ items: StatProps[]; card?: boolean }`
  - `ProgressBar` — `{ value: number /* 0..1, clamped */; height?: number /* 8 */ }`
  - `ScoreRing` — `{ score: number /* 0..100, clamped */; size?: number /* 120 */; label?: string }`
  - `toneForScore(score: number): ColorToken` — `"success"` ≥ 80, `"secondary"` < 50, else `"accent"` (exported from `ScoreRing.tsx`)

- [ ] **Step 1: `Stat.tsx`**

```tsx
import { View } from "react-native";

import { useTheme, type ColorToken } from "@/theme";
import { Text } from "./Text";

export type StatProps = {
  value: string;
  label: string;
  delta?: string;
  deltaTone?: "success" | "danger" | "neutral";
};

export function Stat({ value, label, delta, deltaTone = "neutral" }: StatProps) {
  const t = useTheme();
  const dc: ColorToken = deltaTone === "neutral" ? "textSecondary" : deltaTone;

  return (
    <View style={{ gap: 2 }}>
      <Text variant="title1">{value}</Text>
      <Text variant="caption1" color="textSecondary">
        {label}
      </Text>
      {delta ? (
        <Text variant="caption1" color={dc}>
          {delta}
        </Text>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 2: `StatGrid.tsx`**

```tsx
import { View } from "react-native";

import { useTheme } from "@/theme";
import { Card } from "./Card";
import { Stat, type StatProps } from "./Stat";

export function StatGrid({ items, card }: { items: StatProps[]; card?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.space.m }}>
      {items.map((it) => {
        const inner = <Stat {...it} />;
        return (
          <View key={it.label} style={{ width: "47%", flexGrow: 1 }}>
            {card ? <Card>{inner}</Card> : inner}
          </View>
        );
      })}
    </View>
  );
}
```

- [ ] **Step 3: `ProgressBar.tsx`**

```tsx
import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/theme";

export function ProgressBar({ value, height = 8 }: { value: number; height?: number }) {
  const t = useTheme();
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const w = useSharedValue(0);

  useEffect(() => {
    w.value = withTiming(clamped, { duration: t.motion.durationNormal });
  }, [clamped, w, t.motion.durationNormal]);

  const fill = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));

  return (
    <View
      style={{
        height,
        borderRadius: t.radius.circular,
        backgroundColor: t.color.layerAlt,
        overflow: "hidden",
      }}
    >
      <Animated.View
        style={[
          { height: "100%", borderRadius: t.radius.circular, backgroundColor: t.color.accent },
          fill,
        ]}
      />
    </View>
  );
}
```

- [ ] **Step 4: `ScoreRing.tsx`**

```tsx
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { useTheme, type ColorToken } from "@/theme";
import { Text } from "./Text";

export function toneForScore(score: number): ColorToken {
  if (score >= 80) return "success";
  if (score < 50) return "secondary";
  return "accent";
}

export function ScoreRing({
  score,
  size = 120,
  label,
}: {
  score: number;
  size?: number;
  label?: string;
}) {
  const t = useTheme();
  const clamped = Math.max(0, Math.min(100, Number.isFinite(score) ? score : 0));
  const stroke = size < 48 ? 4 : 8;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const arc = toneForScore(clamped);

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg
        width={size}
        height={size}
        style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={t.color.stroke}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={t.color[arc]}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          strokeLinecap="round"
        />
      </Svg>
      <Text variant={size < 48 ? "caption1Strong" : "title1"}>{Math.round(clamped)}</Text>
      {label && size >= 48 ? (
        <Text variant="caption1" color="textSecondary">
          {label}
        </Text>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 5: Gate**

Run: `cd frontend && npx tsc --noEmit && npx expo lint`
Expected: no `error TS`; lint exit 0.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/ui
git commit -m "feat(ui): add Stat, StatGrid, ProgressBar, ScoreRing primitives

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017KLgfxPWWY4vEMR2tfxMFy"
```

---

## Phase 2 — Navigation

### Task 6: Root layout — themed Stack + drop modal

**Files:**
- Modify: `frontend/app/_layout.tsx` (full rewrite)
- Delete: `frontend/app/modal.tsx`

**Interfaces:**
- Consumes: `ThemeProvider`, `useTheme` from `@/theme`; `AuthProvider` from `@/context/auth-context`; `Stack` from `expo-router`; `@react-navigation/native` `DarkTheme`/`DefaultTheme`.
- Produces: an app tree wrapped `AuthProvider > ThemeProvider > (navigation theme + Stack)`; global `screenOptions` `{ headerShown: false, contentStyle: { backgroundColor: color.bg }, animation: "slide_from_right" }`; `auth/callback` overrides `animation: "fade"`. No `modal` route.

- [ ] **Step 1: Replace `app/_layout.tsx` with:**

```tsx
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavigationThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import { AuthProvider } from "@/context/auth-context";
import { ThemeProvider, useTheme } from "@/theme";

function ThemedStack() {
  const t = useTheme();
  return (
    <NavigationThemeProvider value={t.mode === "dark" ? DarkTheme : DefaultTheme}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: t.color.bg },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="login" />
        <Stack.Screen name="auth/callback" options={{ animation: "fade" }} />
        <Stack.Screen name="onboarding/username" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="messages/[friendId]" />
        <Stack.Screen name="messages/new" />
        <Stack.Screen name="friends/add" />
        <Stack.Screen name="sports" />
        <Stack.Screen name="shot-breakdown" />
        <Stack.Screen name="phase-detail" />
        <Stack.Screen name="player-stats" />
      </Stack>
      <StatusBar style={t.mode === "dark" ? "light" : "dark"} />
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <ThemedStack />
      </ThemeProvider>
    </AuthProvider>
  );
}
```

- [ ] **Step 2: Delete the modal route**

Run: `git rm frontend/app/modal.tsx`
(The `modal` `<Stack.Screen>` entry is already gone from Step 1. `app/modal.tsx` imports `themed-text`/`themed-view`, which Phase 4 deletes — removing it now prevents a dangling reference.)

- [ ] **Step 3: Gate**

Run: `cd frontend && npx tsc --noEmit && npx expo lint`
Expected: no `error TS`; lint exit 0. `npx expo start --web` boots to login; navigating to `/` (after auth) still works; there is no `/modal` route.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/_layout.tsx
git commit -m "refactor(nav): themed root Stack, drop starter modal route

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017KLgfxPWWY4vEMR2tfxMFy"
```

---

### Task 7: Tab bar — 3 tabs, themed

**Files:**
- Modify: `frontend/app/(tabs)/_layout.tsx` (full rewrite)
- Delete: `frontend/app/(tabs)/explore.tsx`

**Interfaces:**
- Consumes: `useTheme` from `@/theme`; `Icon` from `@/components/icons/Icon`; `HapticTab` from `@/components/haptic-tab`; `useAuth`, `useUserProfile` (guard logic unchanged); `Tabs`, `Redirect` from `expo-router`.
- Produces: 3 visible tabs — `index` (Home / `home`), `upload` (Upload / `arrow-upload`), `profile` (Profile / `person`). `messages`, `shop`, `leaderboard` registered with `href: null`. No `explore` entry. Auth guard identical to current.

- [ ] **Step 1: Replace `app/(tabs)/_layout.tsx` with:**

```tsx
import { Redirect, Tabs } from "expo-router";

import { HapticTab } from "@/components/haptic-tab";
import { Icon } from "@/components/icons/Icon";
import { useAuth } from "@/context/auth-context";
import { useUserProfile } from "@/hooks/use-user-profile";
import { useTheme } from "@/theme";

export default function TabLayout() {
  const t = useTheme();
  const { user, isLoading } = useAuth();
  const { hasUsername, isLoading: isProfileLoading } = useUserProfile(user?.sub);

  if (isLoading) return null;
  if (!user) return <Redirect href="/login" />;
  if (isProfileLoading) return null;
  if (!hasUsername) return <Redirect href="/onboarding/username" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: t.color.accent,
        tabBarInactiveTintColor: t.color.textSecondary,
        tabBarStyle: {
          backgroundColor: t.color.layer,
          borderTopWidth: 1,
          borderTopColor: t.color.stroke,
          ...(t.mode === "light"
            ? t.elevation.shadow8
            : { elevation: 0, shadowOpacity: 0 }),
        },
        tabBarLabelStyle: {
          fontSize: t.type.caption1.fontSize,
          fontFamily: t.fonts.sans,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <Icon name="home" size={24} hex={color} />,
        }}
      />
      <Tabs.Screen
        name="upload"
        options={{
          title: "Upload",
          tabBarIcon: ({ color }) => <Icon name="arrow-upload" size={24} hex={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => <Icon name="person" size={24} hex={color} />,
        }}
      />
      <Tabs.Screen name="messages" options={{ href: null }} />
      <Tabs.Screen name="shop" options={{ href: null }} />
      <Tabs.Screen name="leaderboard" options={{ href: null }} />
    </Tabs>
  );
}
```

- [ ] **Step 2: Delete the starter explore tab**

Run: `git rm frontend/app/(tabs)/explore.tsx`
(It has no `<Tabs.Screen>` entry after Step 1. It imports `themed-text`/`themed-view`/`collapsible`/`external-link`/`parallax-scroll-view`/`Fonts` — all deleted in Phase 4; removing it now unblocks those deletions.)

- [ ] **Step 3: Gate**

Run: `cd frontend && npx tsc --noEmit && npx expo lint`
Expected: no `error TS`; lint exit 0. `npx expo start --web`: after auth the tab bar shows exactly Home / Upload / Profile (Profile route resolves in Task 8 — until then Expo Router shows an auto "profile" screen or a 404 for that tab; that is expected mid-phase and fixed next task).

- [ ] **Step 4: Commit**

```bash
git add "frontend/app/(tabs)/_layout.tsx"
git commit -m "refactor(nav): cut tab bar to Home/Upload/Profile, themed

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017KLgfxPWWY4vEMR2tfxMFy"
```

---

### Task 8: Profile tab + player-stats redirect

**Files:**
- Create: `frontend/app/(tabs)/profile.tsx`
- Modify: `frontend/app/player-stats.tsx` (becomes a redirect)

**Interfaces:**
- Consumes: `Screen`, `Text`, `StatGrid`, `ProgressBar`, `ListItem`, `Button`, `Skeleton` primitives; `Icon`; `useAuth` (`user`, `logout`), `useUserProfile`, `useUserStats`, `useApiQuery`; `scoreToGrade` from `@/utils/analysis`; `Redirect` / `router` from `expo-router`.
- Produces: a Profile tab at route `/(tabs)/profile`. `player-stats.tsx` renders `<Redirect href="/(tabs)/profile" />` and nothing else.

Data available (all already in the codebase, unchanged):
- `useUserProfile(user?.sub)` → `{ profile: { username, displayName, email } | null, hasUsername }`
- `useUserStats(user?.sub)` → `{ stats: { videosUploaded, shotsAnalyzed, avgScore, bestScore, level, exp, currentLevelExp, nextLevelExp, progressPct } | undefined }`
- `useApiQuery<SessionMeta[]>("sessions", "/me/sessions?limit=4")` where `SessionMeta = { id: string; sport: string; overall_score: number | null; created_at: string }`

- [ ] **Step 1: Create `app/(tabs)/profile.tsx`**

```tsx
import { router } from "expo-router";
import { View } from "react-native";

import { Button } from "@/components/ui/Button";
import { ListItem } from "@/components/ui/ListItem";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Screen } from "@/components/ui/Screen";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatGrid } from "@/components/ui/StatGrid";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/icons/Icon";
import { useAuth } from "@/context/auth-context";
import { useApiQuery } from "@/hooks/use-api";
import { useUserProfile } from "@/hooks/use-user-profile";
import { useUserStats } from "@/hooks/use-user-stats";
import { useTheme } from "@/theme";
import { scoreToGrade } from "@/utils/analysis";

type SessionMeta = {
  id: string;
  sport: string;
  overall_score: number | null;
  created_at: string;
};

export default function ProfileScreen() {
  const t = useTheme();
  const { user, logout } = useAuth();
  const { profile } = useUserProfile(user?.sub);
  const { stats } = useUserStats(user?.sub);
  const { value: sessions, isLoading } = useApiQuery<SessionMeta[]>(
    "sessions",
    "/me/sessions?limit=4",
  );

  const name = profile?.displayName || user?.name || "KinetiQ player";
  const handle = profile?.username ? `@${profile.username}` : "@you";
  const level = stats?.level ?? 0;
  const progress = (stats?.progressPct ?? 0) / 100;
  const toNextLevel = (stats?.nextLevelExp ?? 0) - (stats?.exp ?? 0);

  return (
    <Screen scroll>
      <View style={{ gap: t.space.l }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: t.space.m }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: t.color.accentSubtle,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="person" size={26} color="accent" />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="title2" numberOfLines={1}>
              {name}
            </Text>
            <Text variant="body1" color="textSecondary">
              {handle}
            </Text>
          </View>
        </View>

        <StatGrid
          items={[
            { value: String(stats?.videosUploaded ?? 0), label: "Videos" },
            { value: String(level), label: "Level" },
            { value: String(stats?.bestScore ?? 0), label: "Best score" },
            { value: (stats?.avgScore ?? 0).toFixed(1), label: "Avg score" },
          ]}
        />

        <View style={{ gap: t.space.s }}>
          <ProgressBar value={progress} />
          <Text variant="caption1" color="textSecondary">
            {toNextLevel} XP to level {level + 1}
          </Text>
        </View>

        <View style={{ gap: t.space.s }}>
          <Text variant="subtitle1">Recent sessions</Text>
          {isLoading ? (
            <View style={{ gap: t.space.s }}>
              <Skeleton width="100%" height={56} />
              <Skeleton width="100%" height={56} />
            </View>
          ) : sessions && sessions.length > 0 ? (
            sessions.map((s, i) => (
              <ListItem
                key={s.id}
                title={`${Math.round(s.overall_score ?? 0)} · ${scoreToGrade(
                  Math.round(s.overall_score ?? 0),
                )}`}
                subtitle={new Date(s.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
                trailing="chevron"
                divider={i < sessions.length - 1}
                onPress={() =>
                  router.push({ pathname: "/shot-breakdown", params: { sessionId: s.id } })
                }
              />
            ))
          ) : (
            <Text variant="body1" color="textSecondary">
              Upload a shot to start building your stats.
            </Text>
          )}
        </View>

        <Button
          label="Sign out"
          icon="sign-out"
          appearance="outline"
          fullWidth
          onPress={logout}
        />
      </View>
    </Screen>
  );
}
```

- [ ] **Step 2: Replace `app/player-stats.tsx` with:**

```tsx
import { Redirect } from "expo-router";

export default function PlayerStats() {
  return <Redirect href="/(tabs)/profile" />;
}
```

- [ ] **Step 3: Gate**

Run: `cd frontend && npx tsc --noEmit && npx expo lint`
Expected: no `error TS`; lint exit 0. `npx expo start --web`: the Profile tab renders the stats layout; visiting `/player-stats` lands on the Profile tab. `player-stats.tsx` no longer imports `MaterialIcons` or `@/constants/colors`.

- [ ] **Step 4: Commit**

```bash
git add "frontend/app/(tabs)/profile.tsx" frontend/app/player-stats.tsx
git commit -m "feat(nav): Profile tab from player-stats content; player-stats -> redirect

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017KLgfxPWWY4vEMR2tfxMFy"
```

---

## Phase 3 — Screens A

Every task in this phase: rewrite the screen's rendered tree + styles onto the primitives, remove its `@/constants/colors` and `@expo/vector-icons/MaterialIcons` imports, and keep every data hook / handler exactly as it is unless the step says otherwise. Gate after each: `npx tsc --noEmit` clean + `npx expo lint` exit 0 + a manual web pass in **both** OS appearances (no clipped text, no raw palette hex, one clear primary action).

### Task 9: Login + auth callback

**Files:**
- Modify: `frontend/app/login.tsx` (full rewrite of the tree; keep the `useAuth` wiring and both `useEffect`s)
- Modify: `frontend/app/auth/callback.tsx` (rewrite only the rendered fallback; keep all effect logic and the `<Redirect>` branch)

- [ ] **Step 1: Rewrite `app/login.tsx`**

Keep: `const { user, isLoading, authError, login, signUp, clearAuthError } = useAuth();`, the `useEffect` that `router.replace("/(tabs)")` on `user`, and the `useEffect` returning `clearAuthError`. Replace the render with:

```tsx
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/context/auth-context";
import { useTheme } from "@/theme";

export default function LoginScreen() {
  const t = useTheme();
  const { user, isLoading, authError, login, signUp, clearAuthError } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) router.replace("/(tabs)");
  }, [user, router]);

  useEffect(() => {
    if (!authError) return;
    return () => clearAuthError();
  }, [authError, clearAuthError]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.color.bg }}>
      <View
        style={{
          flex: 1,
          paddingHorizontal: t.space.xl,
          justifyContent: "space-between",
          paddingBottom: t.space.xl,
        }}
      >
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: t.space.l }}>
          <Image
            source={require("@/assets/images/sky-blue-logo.png")}
            style={{ width: 180, height: 180 }}
            contentFit="contain"
          />
          <Text variant="display">KinetiQ</Text>
          <Text variant="body1" color="textSecondary" align="center">
            Analyze. Align. Achieve.
          </Text>
        </View>

        <View style={{ gap: t.space.m }}>
          {authError ? (
            <InlineAlert tone="danger" title="Verification required" message={authError} />
          ) : null}
          {isLoading ? (
            <ActivityIndicator size="large" color={t.color.accent} style={{ marginVertical: t.space.xl }} />
          ) : (
            <>
              <Button label="Sign in" fullWidth onPress={login} />
              <Button label="Create account" appearance="subtle" fullWidth onPress={signUp} />
            </>
          )}
          <Text variant="caption1" color="textSecondary" align="center">
            By continuing you agree to our Terms of Service and Privacy Policy.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
```

(The old Google button just called `login()` — it is dropped; "Sign in" covers it.)

- [ ] **Step 2: Rewrite the `app/auth/callback.tsx` fallback**

Keep every line from the current file except the final `return (<View style={styles.container}>…</View>)` and its `styles`. Replace that return and drop `StyleSheet`:

```tsx
  // ...all existing imports/effects/`<Redirect>` branch unchanged...
  const t = useTheme(); // add near the top with the other hooks

  if (!code || done) {
    return <Redirect href="/login" />;
  }

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.color.bg, gap: t.space.m }}>
      <ActivityIndicator size="large" color={t.color.accent} />
      <Text variant="body1" color="textSecondary">Signing you in…</Text>
    </View>
  );
```

Add imports: `import { useTheme } from "@/theme";`, `import { Text } from "@/components/ui/Text";`. Keep `View`, `ActivityIndicator`, `Platform` from `react-native`; remove `StyleSheet`.

- [ ] **Step 3: Gate + commit**

```bash
git add frontend/app/login.tsx frontend/app/auth/callback.tsx
git commit -m "feat(ui): rebuild login + auth callback on Fluent primitives

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017KLgfxPWWY4vEMR2tfxMFy"
```

---

### Task 10: Onboarding username (with live availability)

**Files:**
- Modify: `frontend/app/onboarding/username.tsx` (full rewrite)

**Interfaces:**
- Consumes: `Screen`, `Text`, `Field`, `Button`; `ApiError`, `apiFetch` from `@/config/api`; `useAuth`, `useUserProfile`; `isValidUsername`, `normalizeUsernameInput` from `@/services/user-profile`; `Redirect` / `useRouter`.
- Behaviour change: the availability check moves from on-submit to a **debounced live check** driving the `Field` `state`/`helper`; submit only does `PATCH /me/profile`.

- [ ] **Step 1: Replace the file with:**

```tsx
import { Redirect, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { ApiError, apiFetch } from "@/config/api";
import { useAuth } from "@/context/auth-context";
import { useUserProfile } from "@/hooks/use-user-profile";
import { isValidUsername, normalizeUsernameInput } from "@/services/user-profile";
import { useTheme } from "@/theme";

const FORMAT_HINT = "3–20 characters: lowercase letters, numbers, or underscores.";

export default function UsernameOnboardingScreen() {
  const t = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { profile, isLoading } = useUserProfile(user?.sub);

  const [raw, setRaw] = useState("");
  const [available, setAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const username = normalizeUsernameInput(raw);
  const formatValid = isValidUsername(username);

  useEffect(() => {
    setAvailable(null);
    setError(null);
    if (!formatValid) return;

    let cancelled = false;
    setChecking(true);
    const id = setTimeout(async () => {
      try {
        const res = await apiFetch<{ available: boolean }>(
          `/me/username-available?u=${encodeURIComponent(username)}`,
        );
        if (!cancelled) setAvailable(res.available);
      } catch {
        if (!cancelled) setAvailable(null);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [username, formatValid]);

  if (!user) return <Redirect href="/login" />;
  if (!isLoading && profile?.username) return <Redirect href="/(tabs)" />;

  const fieldState: "default" | "error" | "success" =
    !username || checking
      ? "default"
      : !formatValid || available === false
        ? "error"
        : available
          ? "success"
          : "default";

  const helper = error
    ? undefined
    : !formatValid && username
      ? FORMAT_HINT
      : checking
        ? "Checking availability…"
        : available === false
          ? "That username is taken."
          : available
            ? "That username is available."
            : FORMAT_HINT;

  async function handleContinue() {
    if (!formatValid || available !== true) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/me/profile", { method: "PATCH", body: { username } });
      router.replace("/(tabs)");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setError("That username is taken.");
      else if (err instanceof ApiError && err.status === 400)
        setError(err.detail || "That username format is not allowed.");
      else setError("We could not save your username. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <View style={{ gap: t.space.l }}>
        <View style={{ gap: t.space.s }}>
          <Text variant="title2">Choose a username</Text>
          <Text variant="body1" color="textSecondary">
            This is how other players will see you. You can’t change it later.
          </Text>
        </View>

        <Field
          label="Username"
          prefix="@"
          value={raw}
          onChangeText={setRaw}
          placeholder="player"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
          state={fieldState}
          helper={helper}
          error={error ?? undefined}
          onSubmitEditing={handleContinue}
        />

        <Button
          label="Continue"
          fullWidth
          loading={saving}
          disabled={!formatValid || available !== true}
          onPress={handleContinue}
        />
      </View>
    </Screen>
  );
}
```

- [ ] **Step 2: Gate + commit**

```bash
git add frontend/app/onboarding/username.tsx
git commit -m "feat(ui): rebuild username onboarding with live availability check

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017KLgfxPWWY4vEMR2tfxMFy"
```

---

### Task 11: Home

**Files:**
- Modify: `frontend/app/(tabs)/index.tsx` (full rewrite)

**Interfaces:**
- Consumes: `Screen`, `AppBar`, `Text`, `Card`, `Button`, `StatGrid`, `ProgressBar`, `ListItem`, `Skeleton`, `Icon`; `useAuth`, `useUserProfile`, `useUserStats`, `useApiQuery`; `scoreToGrade`; `router`.
- Drops: `useProfileCustomization`, `profile-cosmetics` (`AvatarArtwork`/`BannerArtwork`), `SPORT_EMOJI`, the logout button (logout now lives on Profile).

- [ ] **Step 1: Replace `app/(tabs)/index.tsx` with:**

```tsx
import { router } from "expo-router";
import { Pressable, View } from "react-native";

import { AppBar } from "@/components/ui/AppBar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ListItem } from "@/components/ui/ListItem";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Screen } from "@/components/ui/Screen";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatGrid } from "@/components/ui/StatGrid";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/icons/Icon";
import { useAuth } from "@/context/auth-context";
import { useApiQuery } from "@/hooks/use-api";
import { useUserProfile } from "@/hooks/use-user-profile";
import { useUserStats } from "@/hooks/use-user-stats";
import { useTheme } from "@/theme";
import { scoreToGrade } from "@/utils/analysis";

type SessionMeta = {
  id: string;
  sport: string;
  overall_score: number | null;
  created_at: string;
};

export default function HomeScreen() {
  const t = useTheme();
  const { user } = useAuth();
  const { profile } = useUserProfile(user?.sub);
  const { stats, isLoading: statsLoading } = useUserStats(user?.sub);
  const { value: sportsState } = useApiQuery<{ active: string | null }>("sports", "/me/sports");
  const { value: sessions, isLoading: sessionsLoading } = useApiQuery<SessionMeta[]>(
    "sessions",
    "/me/sessions?limit=4",
  );

  const activeSport = sportsState?.active ?? "basketball";
  const sportLabel = activeSport.charAt(0).toUpperCase() + activeSport.slice(1);
  const level = stats?.level ?? 0;
  const progress = (stats?.progressPct ?? 0) / 100;
  const toNextLevel = (stats?.nextLevelExp ?? 0) - (stats?.exp ?? 0);

  return (
    <Screen
      scroll
      appBar={
        <AppBar
          title="KinetiQ"
          trailing={
            <Pressable
              onPress={() => router.push("/(tabs)/profile")}
              hitSlop={8}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: t.color.accentSubtle,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="person" size={18} color="accent" />
            </Pressable>
          }
        />
      }
    >
      <View style={{ gap: t.space.l }}>
        <View style={{ gap: t.space.xs }}>
          <Text variant="caption1" color="textSecondary">
            {profile?.username ? `@${profile.username}` : "Welcome back"}
          </Text>
          <Text variant="title2">Your progress</Text>
        </View>

        {statsLoading ? (
          <Skeleton width="100%" height={120} />
        ) : (
          <StatGrid
            items={[
              { value: String(level), label: "Level" },
              { value: String(stats?.videosUploaded ?? 0), label: "Videos" },
              { value: String(stats?.bestScore ?? 0), label: "Best score" },
              { value: (stats?.avgScore ?? 0).toFixed(1), label: "Avg score" },
            ]}
          />
        )}

        <View style={{ gap: t.space.s }}>
          <ProgressBar value={progress} />
          <Text variant="caption1" color="textSecondary">
            {toNextLevel} XP to level {level + 1}
          </Text>
        </View>

        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: t.space.m }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="caption1" color="textSecondary">
                Active sport
              </Text>
              <Text variant="subtitle1">{sportLabel}</Text>
            </View>
            <Button label="Change" appearance="subtle" size="sm" onPress={() => router.push("/sports")} />
          </View>
        </Card>

        <View style={{ gap: t.space.s }}>
          <Text variant="subtitle1">Recent</Text>
          {sessionsLoading ? (
            <View style={{ gap: t.space.s }}>
              <Skeleton width="100%" height={56} />
              <Skeleton width="100%" height={56} />
            </View>
          ) : sessions && sessions.length > 0 ? (
            sessions.map((s, i) => (
              <ListItem
                key={s.id}
                leading="history"
                title={`${Math.round(s.overall_score ?? 0)} · ${scoreToGrade(
                  Math.round(s.overall_score ?? 0),
                )}`}
                subtitle={new Date(s.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
                trailing="chevron"
                divider={i < sessions.length - 1}
                onPress={() =>
                  router.push({ pathname: "/shot-breakdown", params: { sessionId: s.id } })
                }
              />
            ))
          ) : (
            <Text variant="body1" color="textSecondary">
              No analyses yet — upload your first shot.
            </Text>
          )}
        </View>

        <Card onPress={() => router.push("/(tabs)/upload")}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: t.space.m }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: t.color.accent,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="arrow-upload" size={22} color="onAccent" />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="body1Strong">Analyze a new shot</Text>
              <Text variant="caption1" color="textSecondary">
                Record or upload a clip to get your breakdown.
              </Text>
            </View>
            <Icon name="chevron-right" size={20} color="textSecondary" />
          </View>
        </Card>
      </View>
    </Screen>
  );
}
```

- [ ] **Step 2: Gate + commit**

```bash
git add "frontend/app/(tabs)/index.tsx"
git commit -m "feat(ui): rebuild Home as a stats dashboard on Fluent primitives

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017KLgfxPWWY4vEMR2tfxMFy"
```

---

### Task 12: Upload

**Files:**
- Modify: `frontend/app/(tabs)/upload.tsx` (rewrite the render + styles; keep `submitAsset`, `handleUpload`, `SOURCE_ACTIONS` keys, `useApiQuery("sports")`, `analyzeVideo(asset, activeSport ?? "basketball")`, the `apiFetch("/me/sessions", …)` POST, `invalidate("stats")` / `invalidate("sessions")`, and the `router.push("/shot-breakdown", …)` — all verbatim)

**Interfaces:**
- Consumes: `Screen`, `Text`, `Card`, `Button`, `Chip`, `InlineAlert`, `Icon`; existing `ImagePicker` logic.
- Change: `showError()` (which used `window.alert` / `Alert.alert`) is replaced by an `errorMsg` state rendered as `<InlineAlert tone="danger">`.

- [ ] **Step 1: Rewrite `app/(tabs)/upload.tsx`**

Keep the whole `BasketballUpload` data/logic block, but: replace `const [selectedFileName, ...]` usage as-is; add `const [errorMsg, setErrorMsg] = useState<string | null>(null);`; replace every `showError(x)` call with `setErrorMsg(x)`; clear it (`setErrorMsg(null)`) at the top of `handleUpload` and `submitAsset`. Delete the `showError` function and the `Platform`/`Alert` imports. Render:

```tsx
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/icons/Icon";
import { apiFetch } from "@/config/api";
import { useApiQuery, invalidate } from "@/hooks/use-api";
import { analyzeVideo } from "@/services/kinetiq-api";
import { useTheme } from "@/theme";

const REQUIREMENTS = ["Side angle", "Good lighting", "5–15 sec", "Full body"];

// ...VideoSource type + BasketballUpload with the EXISTING submitAsset / handleUpload
//    bodies unchanged except showError -> setErrorMsg and the errorMsg state...

function BasketballUpload({ activeSport }: { activeSport: string | null }) {
  const t = useTheme();
  const [latestSessionId, setLatestSessionId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // submitAsset / handleUpload: copied verbatim from the current file, with
  //   showError(msg)  ->  setErrorMsg(msg)
  //   and setErrorMsg(null) at the start of handleUpload.

  const sportName = activeSport ?? "basketball";
  const sportLabel = sportName.charAt(0).toUpperCase() + sportName.slice(1);

  return (
    <Screen scroll>
      <View style={{ gap: t.space.l }}>
        <View style={{ alignSelf: "flex-start" }}>
          <Chip label={`Analyzing as ${sportLabel}`} tone="accent" />
        </View>

        {errorMsg ? (
          <InlineAlert
            tone="danger"
            message={errorMsg}
            onDismiss={() => setErrorMsg(null)}
          />
        ) : null}

        <Card>
          <View style={{ alignItems: "center", gap: t.space.m }}>
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: t.color.accentSubtle,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {isSubmitting ? (
                <ActivityIndicator color={t.color.accent} size="large" />
              ) : (
                <Icon name="camera" size={30} color="accent" />
              )}
            </View>

            <Text variant="title3">Add your shot</Text>

            {isSubmitting ? (
              <Text variant="body1" color="textSecondary" align="center">
                {statusMessage ?? "Analyzing…"}
              </Text>
            ) : (
              <>
                <Text variant="body1" color="textSecondary" align="center">
                  Record a new clip or pick one from your library.
                </Text>
                <Button
                  label="Record video"
                  icon="camera"
                  fullWidth
                  onPress={() => handleUpload("camera")}
                />
                <Button
                  label="Choose file"
                  icon="image"
                  appearance="outline"
                  fullWidth
                  onPress={() => handleUpload("library")}
                />
              </>
            )}

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.space.s, justifyContent: "center" }}>
              {REQUIREMENTS.map((r) => (
                <Chip key={r} label={r} />
              ))}
            </View>

            {latestSessionId ? (
              <Button
                label="Open latest analysis"
                appearance="subtle"
                onPress={() =>
                  router.push({ pathname: "/shot-breakdown", params: { sessionId: latestSessionId } })
                }
              />
            ) : null}
          </View>
        </Card>
      </View>
    </Screen>
  );
}

export default function UploadScreen() {
  const { value: sportsState } = useApiQuery<{ active: string | null }>("sports", "/me/sports");
  const activeSport = sportsState?.active ?? null;
  const sport = (activeSport ?? "basketball").toLowerCase();
  return sport === "basketball" ? <BasketballUpload activeSport={activeSport} /> : <Screen><View /></Screen>;
}
```

- [ ] **Step 2: Gate + commit**

```bash
git add "frontend/app/(tabs)/upload.tsx"
git commit -m "feat(ui): rebuild Upload on Fluent primitives; inline error banner

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017KLgfxPWWY4vEMR2tfxMFy"
```

---

### Task 13: Shot breakdown

**Files:**
- Modify: `frontend/app/shot-breakdown.tsx` (full rewrite of the tree; keep the `useApiQuery` key/path logic, `getPhaseKeys().filter(...)`, `overallScore`, `priorityPhaseKey`)

**Interfaces:**
- Consumes: `Screen`, `AppBar`, `Text`, `Card`, `ListItem`, `ScoreRing`, `EmptyState`, `Icon`; `Image` from `expo-image`; `getPhaseLabel`, `scoreToGrade`, `isAnalysisPhaseKey` from `@/utils/analysis`; `router`, `useLocalSearchParams`.
- Delete the local `ScoreRing` (use the primitive). Remove `MaterialIcons`, the orange constants, the hand-rolled header, and the `FINISH` / `router.push("/player-stats")` button (redundant with the tab bar).

- [ ] **Step 1: Rewrite `app/shot-breakdown.tsx`**

```tsx
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { AppBar } from "@/components/ui/AppBar";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListItem } from "@/components/ui/ListItem";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { useApiQuery } from "@/hooks/use-api";
import type { AnalysisSession } from "@/types/analysis";
import { useTheme } from "@/theme";
import { getPhaseKeys, getPhaseLabel, isAnalysisPhaseKey, scoreToGrade } from "@/utils/analysis";

type SessionFull = {
  id: string;
  sport?: string;
  overall_score?: number | null;
  source?: AnalysisSession["source"];
  analysis: AnalysisSession["analysis"];
  created_at?: string;
};

export default function ShotBreakdownScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ sessionId?: string }>();
  const requestedSessionId = typeof params.sessionId === "string" ? params.sessionId : null;
  const key = requestedSessionId ? `session:${requestedSessionId}` : "session:active";
  const path = requestedSessionId ? `/me/sessions/${requestedSessionId}` : "/me/sessions/active";
  const { value: session, isLoading } = useApiQuery<SessionFull | null>(key, path);

  const appBar = <AppBar title="Shot analysis" onBack={() => router.back()} />;

  if (isLoading) {
    return (
      <Screen appBar={appBar}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: t.space.m }}>
          <ActivityIndicator size="large" color={t.color.accent} />
          <Text variant="body1" color="textSecondary">Loading analysis…</Text>
        </View>
      </Screen>
    );
  }

  if (!session) {
    return (
      <Screen appBar={appBar}>
        <EmptyState
          icon="chart"
          title="No analysis yet"
          body="Upload a shot video so we can generate a breakdown."
          action={{ label: "Go to Upload", onPress: () => router.replace("/(tabs)/upload") }}
        />
      </Screen>
    );
  }

  const phaseKeys = getPhaseKeys().filter((k) => session.analysis.phases[k]);
  const overallScore = Math.round(session.analysis.overall_score);
  const priorityPhaseKey = isAnalysisPhaseKey(session.analysis.priority)
    ? session.analysis.priority
    : "ready_position";
  const savedAt = new Date(session.created_at ?? Date.now()).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <Screen scroll appBar={appBar}>
      <View style={{ gap: t.space.l }}>
        <Card>
          <View style={{ alignItems: "center", gap: t.space.s }}>
            <ScoreRing score={overallScore} label={scoreToGrade(overallScore)} />
            <Text variant="subtitle1">Focus: {getPhaseLabel(priorityPhaseKey)}</Text>
            <Text variant="caption1" color="textSecondary">
              {(session.sport ?? "basketball").replace(/^\w/, (c) => c.toUpperCase())} · {savedAt}
            </Text>
          </View>
        </Card>

        {session.analysis.pose_gif ? (
          <Card pad="s">
            <Image
              source={{ uri: `data:image/gif;base64,${session.analysis.pose_gif}` }}
              style={{ width: "100%", height: 240, borderRadius: t.radius.l }}
              contentFit="contain"
            />
          </Card>
        ) : null}

        <View style={{ gap: t.space.s }}>
          <Text variant="subtitle1">Phases</Text>
          {phaseKeys.map((k, i) => {
            const phase = session.analysis.phases[k];
            if (!phase) return null;
            return (
              <ListItem
                key={k}
                title={getPhaseLabel(k)}
                subtitle={phase.status.replace(/_/g, " ")}
                trailing={<ScoreRing score={phase.score} size={36} />}
                divider={i < phaseKeys.length - 1}
                onPress={() =>
                  router.push({
                    pathname: "/phase-detail",
                    params: { sessionId: session.id, phaseKey: k },
                  })
                }
              />
            );
          })}
        </View>
      </View>
    </Screen>
  );
}
```

- [ ] **Step 2: Gate + commit**

```bash
git add frontend/app/shot-breakdown.tsx
git commit -m "feat(ui): rebuild shot breakdown on Fluent primitives

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017KLgfxPWWY4vEMR2tfxMFy"
```

---

### Task 14: Phase detail

**Files:**
- Modify: `frontend/app/phase-detail.tsx` (full rewrite of the tree; keep the `useApiQuery` call, `phaseKey` resolution, `splitAngleMeasurements`, `RESOURCE_URL_REPLACEMENTS` + `getWorkingResourceUrl`)

**Interfaces:**
- Consumes: `Screen`, `AppBar`, `Text`, `Card`, `ListItem`, `Chip`, `ScoreRing`, `EmptyState`, `Icon`; `Image` from `expo-image`; `Linking` from `react-native`; `formatAngleLabel`, `getPhaseLabel`, `isAnalysisPhaseKey` from `@/utils/analysis`.
- Delete the local `ScoreRing` and `FeedbackRow`. Remove `MaterialIcons` and the orange/green/yellow constants.

- [ ] **Step 1: Rewrite `app/phase-detail.tsx`**

```tsx
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { Linking, View } from "react-native";

import { AppBar } from "@/components/ui/AppBar";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListItem } from "@/components/ui/ListItem";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { useApiQuery } from "@/hooks/use-api";
import type { AnalysisSession } from "@/types/analysis";
import { useTheme } from "@/theme";
import { formatAngleLabel, getPhaseLabel, isAnalysisPhaseKey } from "@/utils/analysis";

type SessionFull = { analysis: AnalysisSession["analysis"] };

const RESOURCE_URL_REPLACEMENTS: Record<string, string> = {
  // ...copied verbatim from the current file...
};
function getWorkingResourceUrl(url: string) {
  return RESOURCE_URL_REPLACEMENTS[url] ?? url;
}

function measureTone(score: number): "success" | "accent" | "danger" {
  if (score >= 85) return "success";
  if (score >= 70) return "accent";
  return "danger";
}

export default function PhaseDetailScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ sessionId?: string; phaseKey?: string }>();
  const phaseKey =
    typeof params.phaseKey === "string" && isAnalysisPhaseKey(params.phaseKey)
      ? params.phaseKey
      : "ready_position";
  const sessionId = typeof params.sessionId === "string" ? params.sessionId : null;

  const { value: session } = useApiQuery<SessionFull | null>(
    sessionId ? `session:${sessionId}` : null,
    sessionId ? `/me/sessions/${sessionId}` : null,
  );

  const phase = session?.analysis.phases[phaseKey];
  const phaseImages = session?.analysis.phase_images?.[phaseKey];
  const measurements = phase?.angles_measured ?? {};
  const appBar = <AppBar title={getPhaseLabel(phaseKey)} onBack={() => router.back()} />;

  if (!session || !phase) {
    return (
      <Screen appBar={appBar}>
        <EmptyState
          icon="chart"
          title="Phase details unavailable"
          body="Open a saved shot analysis first."
          action={{ label: "Back to breakdown", onPress: () => router.replace("/shot-breakdown") }}
        />
      </Screen>
    );
  }

  const measureEntries = Object.entries(measurements);

  return (
    <Screen scroll appBar={appBar}>
      <View style={{ gap: t.space.l }}>
        <Card>
          <View style={{ alignItems: "center", gap: t.space.s }}>
            <ScoreRing score={phase.score} />
            <Text variant="body1" color="textSecondary" align="center">
              {phase.feedback}
            </Text>
          </View>
        </Card>

        {phaseImages?.user_frame || phaseImages?.ideal_frame ? (
          <View style={{ gap: t.space.s }}>
            <Text variant="subtitle1">Your form vs ideal</Text>
            <View style={{ flexDirection: "row", gap: t.space.s }}>
              {[
                { uri: phaseImages?.user_frame, label: "You" },
                { uri: phaseImages?.ideal_frame, label: "Ideal" },
              ].map((f) => (
                <View key={f.label} style={{ flex: 1, gap: t.space.xs }}>
                  {f.uri ? (
                    <Image
                      source={{ uri: `data:image/png;base64,${f.uri}` }}
                      style={{ width: "100%", height: 170, borderRadius: t.radius.l, backgroundColor: t.color.layerAlt }}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={{ height: 170, borderRadius: t.radius.l, backgroundColor: t.color.layerAlt }} />
                  )}
                  <Text variant="caption1" color="textSecondary" align="center">
                    {f.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {measureEntries.length ? (
          <View style={{ gap: t.space.s }}>
            <Text variant="subtitle1">Measurements</Text>
            {measureEntries.map(([label, value], i) => (
              <ListItem
                key={label}
                title={formatAngleLabel(label)}
                subtitle={`Ideal ${value.ideal}`}
                trailing={
                  <Chip label={`${Math.round(value.value)}°`} tone={measureTone(value.score)} />
                }
                divider={i < measureEntries.length - 1}
              />
            ))}
          </View>
        ) : null}

        {phase.resources.length ? (
          <View style={{ gap: t.space.s }}>
            <Text variant="subtitle1">Resources</Text>
            {phase.resources.map((r, i) => (
              <ListItem
                key={`${r.label}:${r.url}`}
                title={r.label}
                trailing="chevron"
                divider={i < phase.resources.length - 1}
                onPress={() => Linking.openURL(getWorkingResourceUrl(r.url))}
              />
            ))}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
```

- [ ] **Step 2: Gate + commit**

```bash
git add frontend/app/phase-detail.tsx
git commit -m "feat(ui): rebuild phase detail on Fluent primitives

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017KLgfxPWWY4vEMR2tfxMFy"
```

---

### Task 15: Sports

**Files:**
- Modify: `frontend/app/sports.tsx` (full rewrite of the tree; keep `useApiQuery`/`useApiMutation`/`invalidate`, `SPORTS`, `handleSportPress`, `handleAddSport`, `confirmSport` state)

**Interfaces:**
- Consumes: `Screen`, `AppBar`, `Text`, `ListItem`, `Chip`, `Button`, `InlineAlert`; RN `Modal` (kept — cross-platform) restyled; `router`.
- Change: only `basketball` is interactive. Non-basketball rows show a `caption1` "Coming soon" trailing and have no `onPress`. Errors move from `Alert.alert` to an `errorMsg` state → `<InlineAlert tone="danger">` at the top of the scroll body.

- [ ] **Step 1: Rewrite `app/sports.tsx`**

```tsx
import { router } from "expo-router";
import { useState } from "react";
import { Modal, View } from "react-native";

import { AppBar } from "@/components/ui/AppBar";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { ListItem } from "@/components/ui/ListItem";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { invalidate, useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useTheme } from "@/theme";

const SPORTS = [
  { name: "Basketball", key: "basketball" },
  { name: "Soccer", key: "soccer" },
  { name: "Tennis", key: "tennis" },
  { name: "Baseball", key: "baseball" },
  { name: "Football", key: "football" },
  { name: "Volleyball", key: "volleyball" },
  { name: "Swimming", key: "swimming" },
];

type SportsState = { active: string | null; selected: string[] };

export default function SportsScreen() {
  const t = useTheme();
  const { value: sportsState } = useApiQuery<SportsState>("sports", "/me/sports");
  const activeSport = sportsState?.active ?? null;
  const selected = new Set(sportsState?.selected ?? []);

  const addSport = useApiMutation<SportsState>("/me/sports/selected", "POST");
  const setActive = useApiMutation<SportsState>("/me/sports/active", "PUT");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleBasketballPress() {
    setErrorMsg(null);
    if (selected.has("basketball")) {
      try {
        await setActive.mutate({ sport: "basketball" });
        invalidate("sports");
      } catch {
        setErrorMsg("Could not update your sport. Check your connection and try again.");
      }
    } else {
      setConfirmOpen(true);
    }
  }

  async function handleAdd() {
    setErrorMsg(null);
    try {
      await addSport.mutate({ sport: "basketball" });
      invalidate("sports");
    } catch {
      setErrorMsg("Could not add the sport. Check your connection and try again.");
    } finally {
      setConfirmOpen(false);
    }
  }

  return (
    <Screen scroll appBar={<AppBar title="Sport" onBack={() => router.back()} />}>
      <View style={{ gap: t.space.m }}>
        {errorMsg ? <InlineAlert tone="danger" message={errorMsg} onDismiss={() => setErrorMsg(null)} /> : null}
        <Text variant="body1" color="textSecondary">
          Basketball is live. More sports are on the way.
        </Text>

        {SPORTS.map((s, i) => {
          const isBasketball = s.key === "basketball";
          const isActive = activeSport === s.key;
          return (
            <ListItem
              key={s.key}
              leading="basketball"
              title={s.name}
              divider={i < SPORTS.length - 1}
              onPress={isBasketball ? handleBasketballPress : undefined}
              trailing={
                isBasketball ? (
                  isActive ? (
                    <Chip label="Active" tone="accent" />
                  ) : (
                    <Chip label={selected.has("basketball") ? "Set active" : "Add"} />
                  )
                ) : (
                  <Text variant="caption1" color="textSecondary">
                    Coming soon
                  </Text>
                )
              }
            />
          );
        })}
      </View>

      <Modal visible={confirmOpen} transparent animationType="fade" onRequestClose={() => setConfirmOpen(false)}>
        <View
          style={{
            flex: 1,
            backgroundColor: t.color.overlay,
            justifyContent: "flex-end",
            padding: t.space.l,
          }}
        >
          <View
            style={{
              backgroundColor: t.color.layer,
              borderRadius: t.radius.xl,
              padding: t.space.l,
              gap: t.space.m,
              ...(t.mode === "light" ? t.elevation.shadow16 : { borderWidth: 1, borderColor: t.color.stroke }),
            }}
          >
            <Text variant="subtitle1">Add Basketball?</Text>
            <Text variant="body1" color="textSecondary">
              Start tracking your basketball shots and stats.
            </Text>
            <View style={{ flexDirection: "row", gap: t.space.s, justifyContent: "flex-end" }}>
              <Button label="Cancel" appearance="outline" onPress={() => setConfirmOpen(false)} />
              <Button label="Add sport" onPress={handleAdd} />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
```

- [ ] **Step 2: Gate + commit**

```bash
git add frontend/app/sports.tsx
git commit -m "feat(ui): rebuild sports screen on Fluent primitives; themed confirm sheet

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017KLgfxPWWY4vEMR2tfxMFy"
```

---

## Phase 4 — Screens B + teardown

### Task 16: B2 screens → EmptyState

**Files (all full rewrites):**
- `frontend/app/(tabs)/leaderboard.tsx`
- `frontend/app/(tabs)/messages.tsx`
- `frontend/app/(tabs)/shop.tsx`
- `frontend/app/friends/add.tsx`
- `frontend/app/messages/[friendId].tsx`
- `frontend/app/messages/new.tsx`

**Interfaces:**
- Consumes: `Screen`, `EmptyState`.
- Each screen: `<Screen><EmptyState icon={…} title={…} body="Coming in a future update." /></Screen>`. No `@/components/coming-soon` import anywhere after this task.

- [ ] **Step 1: Write each file**

`leaderboard.tsx` — `icon="trophy"`, `title="Leaderboards"`.
`messages.tsx` — `icon="person"`, `title="Messages"`.
`shop.tsx` — `icon="sparkle"`, `title="Shop"`.
`friends/add.tsx` — `icon="person"`, `title="Add friends"`.
`messages/[friendId].tsx` — `icon="person"`, `title="Conversation"`.
`messages/new.tsx` — `icon="person"`, `title="New message"`.

Template (substitute icon/title):

```tsx
import { EmptyState } from "@/components/ui/EmptyState";
import { Screen } from "@/components/ui/Screen";

export default function Screen_() {
  return (
    <Screen>
      <EmptyState icon="trophy" title="Leaderboards" body="Coming in a future update." />
    </Screen>
  );
}
```

Name each default export to match the current file's export name (`LeaderboardScreen`, `MessagesScreen`, `ShopScreen`, `AddFriendsScreen`, `MessageThreadScreen`, `NewMessageScreen`).

- [ ] **Step 2: Gate + commit**

```bash
git add "frontend/app/(tabs)/leaderboard.tsx" "frontend/app/(tabs)/messages.tsx" "frontend/app/(tabs)/shop.tsx" frontend/app/friends/add.tsx "frontend/app/messages/[friendId].tsx" frontend/app/messages/new.tsx
git commit -m "feat(ui): B2 screens become themed EmptyStates

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017KLgfxPWWY4vEMR2tfxMFy"
```

---

### Task 17: Teardown + final grep gate

**Files — delete:**
`frontend/constants/colors.ts`, `frontend/constants/theme.ts`,
`frontend/components/coming-soon.tsx`, `frontend/components/hello-wave.tsx`,
`frontend/components/parallax-scroll-view.tsx`, `frontend/components/themed-text.tsx`,
`frontend/components/themed-view.tsx`, `frontend/components/external-link.tsx`,
`frontend/components/profile-cosmetics.tsx`,
`frontend/components/ui/icon-symbol.tsx`, `frontend/components/ui/icon-symbol.ios.tsx`,
`frontend/components/ui/collapsible.tsx`,
`frontend/hooks/use-theme-color.ts`, `frontend/hooks/use-profile-customization.ts`.

- [ ] **Step 1: Confirm nothing live still imports the doomed modules**

Run from `frontend/`:
```bash
grep -rn "profile-cosmetics\|use-profile-customization\|use-theme-color\|themed-text\|themed-view\|components/ui/collapsible\|components/external-link\|hello-wave\|parallax-scroll-view\|coming-soon\|icon-symbol\|@/constants/colors\|@/constants/theme" \
  --include="*.tsx" --include="*.ts" app components hooks utils services context config | grep -v node_modules
```
Expected: **only** matches inside the files about to be deleted (they reference each other). If any surviving file matches, fix that file's imports first (it should already be on primitives from an earlier task — this is a safety net).

- [ ] **Step 2: Delete**

```bash
git rm frontend/constants/colors.ts frontend/constants/theme.ts \
  frontend/components/coming-soon.tsx frontend/components/hello-wave.tsx \
  frontend/components/parallax-scroll-view.tsx frontend/components/themed-text.tsx \
  frontend/components/themed-view.tsx frontend/components/external-link.tsx \
  frontend/components/profile-cosmetics.tsx \
  frontend/components/ui/icon-symbol.tsx frontend/components/ui/icon-symbol.ios.tsx \
  frontend/components/ui/collapsible.tsx \
  frontend/hooks/use-theme-color.ts frontend/hooks/use-profile-customization.ts
```

- [ ] **Step 3: Final grep gate**

Run from `frontend/`:
```bash
grep -rn "@/constants/colors\|@/constants/theme\|MaterialIcons\|icon-symbol" \
  --include="*.tsx" --include="*.ts" . | grep -v node_modules
```
Expected: **no output.**

- [ ] **Step 4: Full gate**

Run: `cd frontend && npx tsc --noEmit && npx expo lint`
Expected: no `error TS`; lint exit 0. `npx expo start --web`: walk every route — `/login`, `/auth/callback` (spoof `?code=`), `/onboarding/username`, `/` (Home), `/(tabs)/upload`, `/(tabs)/profile`, `/sports`, `/shot-breakdown`, `/phase-detail`, `/leaderboard`, `/messages`, `/shop`, `/friends/add`, `/messages/new`, `/player-stats` (redirects). Toggle OS dark/light — every screen re-themes, no clipped text, no leftover purple/orange.

- [ ] **Step 5: Commit**

```bash
git add -A frontend
git commit -m "chore(ui): delete legacy theme constants + Expo starter cruft

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017KLgfxPWWY4vEMR2tfxMFy"
```

---

## Self-Review

**1. Spec coverage**

| Spec item | Task(s) |
|---|---|
| `theme/` — 6 token files + `index.ts`, `ThemeProvider` + `useTheme()` | 1 |
| Semantic colour table (dark + light), exact hexes | 1 (Step 2) |
| Type ramp `TYPE` | 1 (Step 3) |
| `SPACE` / `SIZE` / `RADIUS` / `ELEVATION` / `MOTION` | 1 (Steps 4–7) |
| `react-native-svg` via `npx expo install` (only if absent — it is) | 1 (Step 1) |
| `components/icons/` — `registry` + `Icon`, 20-name union | 2 |
| Icons replace `MaterialIcons` + `icon-symbol` | 2 + every Phase 3 task + 17 (grep gate) |
| All 16 `components/ui/` primitives | 3, 4, 5 |
| `ScoreRing` `toneForScore` (success ≥ 80, secondary < 50) | 5 |
| 3-tab `_layout`, B2 routes `href:null`, `explore` removed | 7 |
| `(tabs)/profile.tsx` from `player-stats` content; `player-stats` → redirect | 8 |
| Themed root `<Stack>` + transitions, `auth/callback` fade, delete `modal` | 6 |
| Pushed screens get `<AppBar>` | 13, 14, 15 |
| Per-screen restructure: login | 9 |
| auth/callback | 9 |
| onboarding/username + live `/me/username-available` | 10 |
| Home | 11 |
| upload | 12 |
| shot-breakdown | 13 |
| phase-detail | 14 |
| profile | 8 |
| sports (themed sheet replacing RN Modal styling) | 15 |
| 6 B2 EmptyStates | 16 |
| Delete `constants/colors.ts`, `constants/theme.ts`, starter cruft | 17 |
| Testing gate: `tsc --noEmit` + `expo lint` + visual + final grep | every task; grep in 17 |

No gaps. Items the plan adds beyond the spec's explicit deletion list (`collapsible.tsx`, `use-theme-color.ts`, `external-link.tsx`, `profile-cosmetics.tsx`, `use-profile-customization.ts`) are documented in the "Decomposition note" and forced by the grep/type gates.

**2. Placeholder scan**

The only intentional fill-ins are the icon path `d` strings in Task 2 Step 2 — third-party asset data, with an exact per-icon source-file mapping table, a worked example of a real entry, and a render-verification step. Everything else is complete code. `RESOURCE_URL_REPLACEMENTS` in Task 14 is explicitly "copied verbatim from the current file" (a 10-entry literal already in the repo — reproduced by copy, not retyped, and not logic).

**3. Type consistency**

- `useTheme()` shape defined once in Task 1; every primitive and screen consumes `t.color` / `t.space` / `t.type` / `t.radius` / `t.elevation` / `t.motion` / `t.size` / `t.fonts` / `t.mode` exactly as declared.
- `ColorToken` is `keyof ColorSet` (Task 1) and is the `color` prop type on `Text`, `Icon`, `Chip` (tone→token), `InlineAlert` (tone→`${tone}Subtle`), `Stat`, `ScoreRing`. The `` `${tone}Subtle` as ColorToken `` casts in `Chip`/`InlineAlert` rely on `successSubtle`/`dangerSubtle`/`accentSubtle` existing in `ColorSet` — they do (Task 1 Step 2).
- `IconName` (Task 2) is the `name` prop on `Icon`, `Button.icon`, `ListItem.leading` (string branch), `EmptyState.icon`, `InlineAlert` internal map. Every literal used in screens (`"home"`, `"arrow-upload"`, `"camera"`, `"image"`, `"chevron-left"`, `"chevron-right"`, `"person"`, `"trophy"`, `"chart"`, `"basketball"`, `"history"`, `"sign-out"`, `"sparkle"`, `"checkmark-circle"`, `"dismiss"`, `"warning"`, `"info"`) is in the 20-name union.
- `StatProps` exported from `Stat.tsx`, consumed by `StatGrid` — same file group (Task 5).
- `Icon` gains `hex?: string` in Task 2 specifically so Task 7's `tabBarIcon: ({ color }) => <Icon … hex={color} />` type-checks; no other caller passes `hex`.
- `Screen` `appBar?: ReactNode` (Task 3) — Tasks 11/13/14/15 pass `<AppBar …/>`; Task 8/9/10/12/16 omit it. Consistent.
- `useUserStats` fields referenced (`level`, `videosUploaded`, `bestScore`, `avgScore`, `exp`, `nextLevelExp`, `progressPct`) all exist on `AppUserStats` (verified in `hooks/use-user-stats.ts`).
- `useUserProfile` returns `{ profile: { username, displayName, email } | null, hasUsername, isLoading }` — Tasks 8/10/11 use only those.
- Route strings (`/(tabs)/profile`, `/(tabs)/upload`, `/sports`, `/shot-breakdown`, `/phase-detail`, `/login`, `/(tabs)`) all resolve against `.expo/types/router.d.ts` (typed routes on); `/(tabs)/profile` becomes valid once Task 8 creates the file (Task 7, which references it, is followed immediately by Task 8 — the mid-phase gap is called out in Task 7 Step 3).

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-09-07-kinetiq-ui-fluent-rework.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
