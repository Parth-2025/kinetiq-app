# KinetiQ UI Rework — Fluent Design System

**Status:** Draft for review
**Date:** 2026-09-07
**Scope:** Frontend only (`frontend/`, Expo Router app `rim-ready`). A full visual + IA rework of every screen onto a shared Fluent-2-style design system.

## Context

The KinetiQ app works end to end (auth → sports → upload → analysis → stats) but the UI is a hand-rolled light theme: ~50 ad-hoc colour constants in `constants/colors.ts`, the unused Expo-starter `constants/theme.ts`, per-screen `StyleSheet.create` blobs, a mix of `MaterialIcons` and SF-Symbols (`IconSymbol`), and a 5-tab bar where 3 tabs (Messages, Shop, Leaderboard) plus Friends are B2 "coming soon" stubs. It reads as disconnected and unfinished.

This rework introduces a single Fluent-2-derived design system — tokens, typography ramp, spacing, primitives, a curated icon set — and restyles/restructures every screen against it so the app flows as one product.

## Goals

1. One theming layer (`theme/`) with semantic colour tokens for **dark and light**, a Fluent type ramp, a 4px spacing scale, radius/elevation/motion tokens, and a `useTheme()` hook. No screen references a raw hex after this.
2. A curated set of ~20 Fluent 2 SVG icons with one `<Icon>` API, replacing `MaterialIcons` + `IconSymbol`.
3. A set of themed primitives (`Screen`, `AppBar`, `Text`, `Card`, `Button`, `Chip`, `Field`, `ListItem`, `Stat`/`StatGrid`, `ProgressBar`, `ScoreRing`, `EmptyState`, `InlineAlert`, `Divider`, `Skeleton`) that every screen composes.
4. Navigation cut to 3 real tabs (Home, Upload, Profile); B2 routes retained in code but hidden.
5. Every screen restructured to a consistent layout rhythm and type hierarchy, with one clear primary action per screen.
6. `constants/colors.ts`, `constants/theme.ts`, and the Expo-starter component cruft removed.

## Non-Goals

- No backend changes. No new features. No B2 functionality — the B2 screens become polished empty states, not working screens.
- No new state-management or data-fetching library. `useApiQuery`/`useApiMutation` and `auth-context` are unchanged.
- No `@fluentui/react-native` dependency — this is a Fluent-*derived* system built on React Native `StyleSheet`.
- No custom font bundling — the platform system font (SF Pro / Roboto) is the cross-platform Fluent substitute for Segoe UI.
- No frontend test runner (none exists; not adding one).
- No animation library beyond `react-native-reanimated` (already present) and Expo Router's built-in transitions.

## Global Constraints

- Expo Router app; TypeScript `strict`. `npx tsc --noEmit` reports **0 `error TS`** and `npx expo lint` exits **0** after every phase.
- Runs identically on web and native — no platform-only components; `Platform.select` only for genuinely platform-specific values (already used for fonts).
- The one new dependency permitted is `react-native-svg`, installed via `npx expo install` (Expo-managed). If it is already a transitive dep, no install.
- The Auth0 PKCE flow, the auth guard in `app/(tabs)/_layout.tsx`, and all `useApiQuery`/`apiFetch` call sites keep their current behaviour — only their presentation changes.
- Route paths that other code links to are preserved (`/shot-breakdown`, `/phase-detail`, `/sports`, `/player-stats`, `/onboarding/username`, `/login`); `player-stats` becomes a redirect, not a 404.
- Colour palette (fixed): `#11151C`, `#212D40`, `#364156`, `#7D4E57`, `#D66853`. Derived neutrals/status colours may be added but the five are the spine.
- All work on a dedicated branch, never `main`. Commits attributed to Parth Mohan <parthmohan2006@gmail.com>.

## Architecture

### `theme/` — the token layer

```
frontend/theme/
  tokens.ts       # PALETTE + semantic colour tokens, per mode
  typography.ts   # the Fluent type ramp
  spacing.ts      # 4px scale
  radius.ts       # corner radii
  elevation.ts    # shadow tokens (light) / border-based elevation (dark)
  motion.ts       # durations + easing curves
  index.ts        # ThemeProvider + useTheme()
```

**`tokens.ts`.** A `PALETTE` object (`{ink: "#11151C", slate: "#212D40", steel: "#364156", rose: "#7D4E57", terracotta: "#D66853"}` plus derived tints/shades), then a `makeColors(mode)` returning the semantic set:

| token | dark | light |
|---|---|---|
| `bg` | `#11151C` | `#F5F6F8` |
| `layer` | `#212D40` | `#FFFFFF` |
| `layerAlt` | `#1A2231` | `#EEF1F4` |
| `stroke` | `#364156` | `#E1E5EA` |
| `strokeSoft` | `#2A3444` | `#EEF1F4` |
| `text` | `#F3F5F8` | `#11151C` |
| `textSecondary` | `#9FB0C3` | `#5A6B7D` |
| `textDisabled` | `#5C6B7E` | `#A6B0BB` |
| `accent` | `#D66853` | `#D66853` |
| `accentHover` | `#E07C69` | `#C25642` |
| `accentPressed` | `#BF5745` | `#AC4A38` |
| `accentSubtle` | `#2A2028` | `#FBEEEA` |
| `onAccent` | `#FFFFFF` | `#FFFFFF` |
| `secondary` | `#7D4E57` | `#7D4E57` |
| `secondarySubtle` | `#241D20` | `#F6EEF0` |
| `success` | `#3FB984` | `#1F9D6B` |
| `successSubtle` | `#16241F` | `#E7F6EF` |
| `danger` | `#E5686D` | `#D64550` |
| `dangerSubtle` | `#2A1B1C` | `#FBEBEC` |
| `overlay` | `rgba(9,12,17,0.6)` | `rgba(17,21,28,0.35)` |


**`typography.ts`.** `TYPE` map, each entry `{ size, lineHeight, weight }`, `weight` a string `"400" | "600" | "700"`:

| key | size / line-height / weight |
|---|---|
| `caption1` | 12 / 16 / 400 |
| `caption1Strong` | 12 / 16 / 600 |
| `body1` | 15 / 20 / 400 |
| `body1Strong` | 15 / 20 / 600 |
| `subtitle1` | 18 / 24 / 600 |
| `title3` | 20 / 26 / 700 |
| `title2` | 24 / 30 / 700 |
| `title1` | 28 / 34 / 700 |
| `display` | 34 / 40 / 700 |

Font family: `Fonts.sans` from a trimmed `theme/typography.ts` (moved from `constants/theme.ts`).

**`spacing.ts`.** `SPACE = { xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 24, xxxl: 32 }`. Control heights `SIZE = { sm: 32, md: 40, lg: 48 }`.

**`radius.ts`.** `RADIUS = { s: 4, m: 6, l: 8, xl: 12, circular: 999 }`.

**`elevation.ts`.** `ELEVATION.shadow2 / shadow4 / shadow8 / shadow16` each an RN style object `{ shadowColor, shadowOpacity, shadowRadius, shadowOffset, elevation }` tuned for light mode. In dark mode components render elevation as `layer` + a `stroke` border and ignore the shadow object (the primitives branch on `mode`).

**`motion.ts`.** `MOTION = { durationFast: 100, durationNormal: 200, durationSlow: 300, curveDecel: Easing.out(Easing.cubic), curveStandard: Easing.inOut(Easing.cubic) }`.

**`index.ts`.**
- `ThemeProvider` — React context; value from `makeColors(mode)` + the static scales, where `mode` = an override state (default `null`) falling back to `useColorScheme()`. Exposes `setThemeOverride(mode | null)` for a future settings toggle (not wired to UI in this rework).
- `useTheme(): { color, type, space, radius, elevation, motion, mode }`.
- Wrapped around the app inside `AuthProvider` in `app/_layout.tsx`.

### `components/icons/` — the icon set

- `registry.ts` — `ICONS: Record<IconName, React.FC<{size:number; color:string}>>`. Each entry is a small `react-native-svg` component (paths hand-copied from the MIT `@fluentui/svg-icons` 20px regular/filled set).
- `Icon.tsx` — `<Icon name={IconName} size?={number=20} color?={ColorToken="text"} />`; resolves `color` through `useTheme().color`, renders `ICONS[name]`.
- `IconName` union: `home`, `arrow-upload`, `camera`, `image`, `chevron-left`, `chevron-right`, `person`, `trophy`, `chart`, `basketball`, `checkmark-circle`, `dismiss`, `warning`, `info`, `history`, `settings`, `sign-out`, `sparkle`, `play`, `lock`.
- Replaces every `MaterialIcons` import and the `components/ui/icon-symbol*` files.

### `components/ui/` — primitives

Each file exports one component. All consume `useTheme()`; none hard-codes a colour. Prop conventions: `variant`/`appearance`/`tone`/`size` string enums; `style` escape hatch on layout wrappers only.

| component | key props | notes |
|---|---|---|
| `Screen` | `scroll?`, `appBar?: ReactNode`, `pad?: boolean=true`, `children` | `SafeAreaView` + `color.bg`; horizontal padding `space.l`; if `scroll`, a `ScrollView` with `showsVerticalScrollIndicator={false}` and `contentContainerStyle` bottom pad `space.xxxl` |
| `AppBar` | `title`, `onBack?`, `trailing?: ReactNode` | height 52; back = `Icon name="chevron-left"` in a 40px hit target; title `type.title3`; `stroke` hairline bottom border |
| `Text` | `variant: keyof TYPE = "body1"`, `color: ColorToken = "text"`, `weight?`, `numberOfLines?`, `align?` | the only text primitive; applies `type[variant]` + `color[color]` + `Fonts.sans` |
| `Card` | `onPress?`, `pad?: keyof SPACE = "l"`, `children`, `style?` | `layer` bg, `radius.xl`; dark: `stroke` 1px border; light: `elevation.shadow4`; if `onPress`, `Pressable` with `opacity 0.92` + `scale 0.99` on press over `motion.durationFast` |
| `Button` | `appearance: "primary"|"secondary"|"subtle"|"outline" = "primary"`, `size: "sm"|"md"|"lg" = "md"`, `icon?: IconName`, `loading?`, `disabled?`, `onPress`, `label` | primary = `accent` bg / `onAccent` text; secondary = `secondary` bg; outline = transparent + `stroke` border + `text`; subtle = transparent + `accent` text; height from `SIZE`; icon gap `space.s`; `loading` shows an `ActivityIndicator` and disables |
| `Chip` | `label`, `tone: "neutral"|"accent"|"success"|"danger" = "neutral"`, `dot?` | pill, `radius.circular`, `caption1Strong`; tone sets bg = `<tone>Subtle`, text = `<tone>` (neutral = `layerAlt` / `textSecondary`) |
| `Field` | `label`, `value`, `onChangeText`, `placeholder?`, `helper?`, `error?`, `state?: "default"|"error"|"success"`, `autoCapitalize?` etc. | label `caption1Strong` `textSecondary`; input `layerAlt` bg, `radius.m`, 44 tall, `text` colour; focus → `accent` 1.5px bottom border; helper/error `caption1` toned |
| `ListItem` | `title`, `subtitle?`, `leading?: IconName | ReactNode`, `trailing?: "chevron" | ReactNode`, `onPress?` | 56 min height, `space.m` vertical pad, `stroke` hairline divider (via a `divider?` prop or wrapping list); leading icon in a 36px `accentSubtle` circle when an `IconName` |
| `Stat` | `value: string`, `label: string`, `delta?: string`, `deltaTone?` | `value` `type.title1`, `label` `caption1` `textSecondary`; used inside `StatGrid` |
| `StatGrid` | `items: StatProps[]` | 2-column grid, `space.m` gaps; wraps each in a bare `View` (not a `Card`) unless `card` prop set |
| `ProgressBar` | `value: 0..1`, `height?: number=8` | track `layerAlt`, fill `accent`, `radius.circular`; animates width over `motion.durationNormal` |
| `ScoreRing` | `score: 0..100`, `size?: number=120`, `label?: string` | `react-native-svg` circle; track `stroke`, arc `accent` (or `success` ≥ 80, `secondary` < 50 — a `toneForScore` helper); centre = `score` in `type.title1` + optional `label` `caption1` |
| `EmptyState` | `icon: IconName`, `title: string`, `body?: string`, `action?: {label, onPress}` | centred column, `space.l` gaps; icon in a 64px `layerAlt` circle; used by every B2 screen |
| `InlineAlert` | `tone: "info"|"success"|"danger"`, `title?`, `message`, `onDismiss?` | `<tone>Subtle` bg, `<tone>` left border 3px, `radius.m`; leading `Icon` (`info`/`checkmark-circle`/`warning`) |
| `Divider` | `inset?: number=0` | 1px `stroke` |
| `Skeleton` | `width`, `height`, `radius?` | `layerAlt` block; subtle opacity pulse via reanimated |

### Navigation & IA

- **`app/(tabs)/_layout.tsx`** — 3 `Tabs.Screen`s: `index` (Home, icon `home`), `upload` (Upload, icon `arrow-upload`), `profile` (Profile, icon `person`). `messages`, `shop`, `leaderboard` each `options={{ href: null }}` (route kept, hidden). `explore` removed. `tabBarStyle`: `color.layer` bg, `stroke` 1px top border, no shadow in dark / `elevation.shadow8` in light; `tabBarActiveTintColor: color.accent`, inactive `color.textSecondary`; label `type.caption1`. Auth-guard logic unchanged.
- **`app/(tabs)/profile.tsx`** — new; the content currently in `app/player-stats.tsx` moves here (a tab, so no `AppBar`; page title `type.title2`). `app/player-stats.tsx` becomes `export default function PlayerStats() { return <Redirect href="/(tabs)/profile" />; }`.
- **`app/_layout.tsx`** — wrap the tree in `<ThemeProvider>` (inside `AuthProvider`). `<Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: <themed bg> }, animation: "slide_from_right" }}>`; `auth/callback` gets `animation: "fade"`. Delete the `modal` screen entry.
- **Pushed screens** (`sports`, `shot-breakdown`, `phase-detail`) — each rendered inside `<Screen appBar={<AppBar title="…" onBack={() => router.back()} />}>`; their hand-rolled back arrows/headers deleted.
- **Deletions:** `app/modal.tsx`, `app/(tabs)/explore.tsx`, `components/coming-soon.tsx`, `components/hello-wave.tsx`, `components/parallax-scroll-view.tsx`, `components/themed-text.tsx`, `components/themed-view.tsx`, `components/ui/icon-symbol.tsx` (+ `.ios.tsx` if present), `constants/colors.ts`, `constants/theme.ts`. `components/external-link.tsx` and `components/haptic-tab.tsx` kept if still referenced (haptic-tab is used by the tab bar — keep; re-skin not needed).

### Per-screen restructure

Common pattern: `<Screen scroll appBar={…}?>` → a vertical stack of sections separated by `space.l`; within a section, `space.m`; each screen has exactly one `appearance="primary"` `Button`. Type hierarchy: page title `title2`, section header `subtitle1`, body `body1`, meta `caption1`.

| screen | structure |
|---|---|
| `login.tsx` | full-bleed `color.bg`; brand mark + `display` "KinetiQ" + `body1` tagline; primary `Button` "Sign in", `subtle` "Create account"; `authError` → `InlineAlert tone="danger"`. |
| `auth/callback.tsx` | centred `ActivityIndicator` + `body1` "Signing you in…" on `color.bg`. |
| `onboarding/username.tsx` | `Screen`; `title2` "Choose a username" + `body1` helper; `Field` (username) with the live `/me/username-available` check driving `state` + `helper`/`error`; primary `Button` "Continue" disabled until `isValidUsername` && available; 400/409 from `PATCH /me/profile` → `error` text. |
| `(tabs)/index.tsx` (Home) | `AppBar` ("KinetiQ", trailing avatar → Profile); `StatGrid` (Level, Videos, Best score, Avg); level `ProgressBar` + `caption1` "N XP to level M"; "Active sport" `Card` (sport name + `Button appearance="subtle"` "Change" → `/sports`); "Recent" section = up to 4 `ListItem`s (score + date, `onPress` → `/shot-breakdown?sessionId=`); primary CTA `Card` "Analyze a new shot" → Upload tab. Loading → `Skeleton`s. |
| `(tabs)/upload.tsx` | `Screen`; sport `Chip tone="accent"` "Analyzing as Basketball"; `Card` with `Icon camera` in an `accentSubtle` circle, `title3` "Add your shot", `body1` sub, two full-width `Button`s (Record / Choose file); requirement `Chip`s row; while submitting → centred `ActivityIndicator` + status `body1`; after success → `Button appearance="outline"` "Open latest analysis". (Re-skin of the current cleaned screen onto primitives.) |
| `shot-breakdown.tsx` | `Screen appBar` ("Shot analysis"); `Card` centred `ScoreRing` (overall) + `subtitle1` verdict + `caption1` sport/date; per-phase section = `ListItem` per phase (title, `subtitle` = short feedback, `trailing` = a small `ScoreRing size={36}` , `onPress` → `/phase-detail?sessionId=&phaseKey=`); if `pose_gif` → `Card` with the image. |
| `phase-detail.tsx` | `Screen appBar` (phase title); `Card` `ScoreRing` (phase score) + `body1` coaching text; "Your form vs ideal" `Card` = the two base64 images side by side (or stacked on narrow); "Measurements" = `ListItem` per angle (`title` metric, `subtitle` "ideal 155–175°", `trailing` = value `Chip` toned by that metric's score). |
| `(tabs)/profile.tsx` | page `title2`; header row (avatar + name + `@username`); `StatGrid`; level `ProgressBar`; "Recent sessions" list; `Button appearance="outline"` + `Icon sign-out` "Sign out" (calls `logout()`). |
| `sports.tsx` | `Screen appBar` ("Sport"); `ListItem` per sport (leading `Icon basketball`, title, `trailing` = `Chip tone="accent"` "Active" or `Button size="sm"` "Add"); add-confirm via a themed bottom sheet (`InlineAlert`-styled panel with Cancel / Add `Button`s) replacing the current RN `Modal`. Only "basketball" is functional; others show a `caption1` "Coming soon" and are non-tappable. |
| `(tabs)/leaderboard.tsx`, `(tabs)/messages.tsx`, `(tabs)/shop.tsx`, `friends/add.tsx`, `messages/[friendId].tsx`, `messages/new.tsx` | each = `<Screen><EmptyState icon={…} title={…} body="Coming in a future update." /></Screen>`. Icons: `trophy` / `chart` / `sparkle` / `person` / `chart` / `chart` respectively (implementer picks the best fit). |
| `modal.tsx` | deleted. |

## Data flow

Unchanged. Every screen keeps its existing `useApiQuery`/`useApiMutation`/`apiFetch`/`useAuth` calls; only the rendered tree and styles change. `ScoreRing`/`ProgressBar`/`StatGrid` are pure presentational — they take numbers already in scope.

## Error handling

- In-flow errors (upload failure, username taken, auth error) move from `window.alert` / `Alert.alert` to `<InlineAlert>` rendered in the screen body. Truly interrupting confirmations (none currently) would use a themed sheet.
- `useApiQuery` error state on a screen → an `InlineAlert tone="danger"` with a "Retry" action calling `refetch`.
- Loading states use `Skeleton` (lists, stats) or a centred `ActivityIndicator` (full-screen waits).

## Testing

Frontend has no test runner and none is added. The gate for every phase:
- `cd frontend && npx tsc --noEmit` → 0 `error TS`.
- `cd frontend && npx expo lint` → exit 0, no new warnings.
- Manual visual pass on web (`npm run web`) — every screen renders, dark and light (toggle OS appearance), no clipped text, no raw hex leaking through.
- A grep gate at the end: no file under `frontend/` (excluding `node_modules`) imports `@/constants/colors`, `@/constants/theme`, `MaterialIcons`, or `icon-symbol`.

## Implementation phasing (for the plan)

1. **Foundation** — `theme/` (all 6 token files + `index.ts`, with `ThemeProvider` mounted in `app/_layout.tsx` around the existing tree), `react-native-svg` install if not already present, `components/icons/` (registry + `Icon`), and every `components/ui/` primitive. No screen is converted yet and `constants/colors.ts` / `constants/theme.ts` stay in place, so the app still builds. Verification: `tsc --noEmit` + `expo lint` clean, and `import`-ing each primitive from a scratch check compiles. The primitives get real usage in Phase 3.
2. **Navigation** — 3-tab `_layout`, `(tabs)/profile.tsx` (move `player-stats` content), `player-stats.tsx` → redirect, themed `<Stack>` options + transitions, delete `modal.tsx` + `explore.tsx`.
3. **Screens A** — `login`, `auth/callback`, `onboarding/username`, `(tabs)/index`, `(tabs)/upload`, `shot-breakdown`, `phase-detail`, `sports` — each rewritten on the primitives; their `@/constants/colors` and `MaterialIcons` imports removed.
4. **Screens B + teardown** — the 6 B2 screens → `EmptyState`; delete `constants/colors.ts`, `constants/theme.ts`, `components/{coming-soon,hello-wave,parallax-scroll-view,themed-text,themed-view}.tsx`, `components/ui/icon-symbol*`; run the final grep gate.

## Open questions

None. All derived hexes in the token table are final; the implementer may nudge a derived value during Phase 1 if a visual pass shows poor contrast, but the five palette colours are fixed.
