# Performance Studio frontend

Expo / React Native screens. Shared components provide desktop sidebar navigation and mobile primary navigation, with the existing theme and icon system. The welcome videos autoplay muted when motion is allowed, respect reduced-motion preferences, and have explicit play/pause controls.

| Module                | Screens                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------ |
| `welcome.tsx`         | Sign in, athlete/coach selection, three supplied sports-video segments, prototype data explanation           |
| `dashboard.tsx`       | Athlete/coach home, skill catalogue/detail, sessions/reviews, measurement history                            |
| `people.tsx`          | Athlete roster/profile, measurement snapshots, teams, invitations, team membership                           |
| `coaching.tsx`        | Draft/published assignments, practice roster/manual events/reports, equipment inventory                      |
| `sessions.tsx`        | Camera/library selection, authenticated upload, processing/error states, review, sharing, feedback, deletion |
| `motion-replay.tsx`   | Neutral joint preview from stored numerical positions, front/side/oblique projection, frame controls         |
| `session-motion-query.tsx` | Coach interval query for saved elbow/knee angles, valid-sample coverage, missing-value reasons, and gaps |
| `account.tsx`         | Workspace/onboarding guard, settings, admin counts/audit                                                     |
| `ui.tsx`              | Layout, navigation, fields, panels, rows, states                                                             |
| `data.ts`, `types.ts` | Account-scoped API queries, mutations, response types                                                        |

## Routes

Athletes: `/`, `/skills`, `/sessions`, `/progress`, `/team`.

Coaches: `/coach`, `/coach/athletes`, `/coach/practices`, `/coach/sessions`, with teams, assignments, and equipment available in the sidebar, overview, and settings.

Shared: `/capture`, `/skill/:id`, `/session/:id`, `/athlete/:id`, `/teams`, `/team/:id`, `/team/join`, `/assignments`, `/assignment/:id`, `/practice/:id`, `/devices`, `/settings`, `/admin`. The dynamic `new` route opens creation forms. `/athlete/me` opens the account-linked profile. All new data APIs authorize independently of frontend routing.

## Setup and status

Use the existing Auth0/API environment settings. From `frontend/`, run `npm install` then `npm start`. The backend needs migrations through `0008` and `python -m studio.worker`; see [backend instructions](../../../backend/studio/README.md).

The video picker is aligned with Expo SDK 54. Camera recording is native-only. SecureStore saves native access tokens, and the existing web login flow remains. App branding now displays KinetiQ, while the existing app slug and callback scheme remain to preserve Auth0 configuration.

The welcome page now uses the three user-supplied sports videos in full-width, equal segments. Account selection is below the opening viewport. Playback copies are local assets, with matching poster frames and athlete-centered crops. Native uses Expo Video; web uses inline HTML video. Playback pauses offscreen, when unfocused, and in a hidden/background app. Reduced-motion users receive posters unless they explicitly choose Play. Source provenance and encoding details are in [video sources](../../assets/videos/welcome/sources.md).

The page uses warm-neutral flat surfaces, square controls, and Helvetica/Arial/platform sans. Shared light surfaces, elevation tokens, and Studio panel/control corners were aligned with the same direction. The existing account data explanation is a separate route and is not linked from the welcome page. See the [frontend rules](../../../docs/design/frontend-rules.md).

The replay builds neutral volumetric limbs from estimated 3D joints; it is not a fitted or skinned body mesh. Practice metrics remain manual-event summaries. A tracking job can record an uploaded camera source but is marked unsupported and contains no generated tracks. Additional sports/skills, automatic scrimmage analysis, calibrated measurements, and hardware integration require further implementation and evidence.

Coaches can open a ready session and use the saved-interval query panel to inspect left/right elbow or knee samples. It shows valid stored-sample coverage, missing values, gaps, and measurement provenance. These are experimental pose-derived angles; reported dimensions do not change the calculation.

Existing legacy screens and data remain separate. TypeScript compilation and Expo web/iOS/Android exports passed on 2026-10-06. No screenshot review, signed native build, authenticated end-to-end flow, or physical-device testing was performed. This is not an App Store-ready release.

## Video dependency

`expo-video` is aligned with Expo SDK 54. Expo Go for this SDK includes the module; a custom development build must be rebuilt after adding it. Web preview remains `npm run web`. Original source clips stay in the repository root; the app bundles the smaller copies in `assets/videos/welcome`.

## October 16 implementation update

The procedural skinned display rig and saved revision API are now integrated and tested in an isolated database through migration 0009. Session review retains the landmark preview. The earlier joint-only description above describes the previous baseline; fitted display proportions still do not establish anatomical accuracy. Device GL validation remains pending.

New analyses persist per-candidate body summaries and coverage, preliminary differences for two usable candidates, and per-metric dispersion for three or more. Session review labels these as unconfirmed movement candidates. Actual ball tracking, confirmed shots, release timing, calibrated speed/arc, and spin are pending. The source-resolution ball-evidence contract is in `docs/design/basketball-shot-evidence-v1.md` at the repository root.

Backend regression: 275 passed, 2 MediaPipe tests excluded; geometry, TypeScript, and all platform exports passed. A subsequent pair-comparison adjustment passed focused tests and TypeScript. The configured local development DB was stopped on port 5432, so its migration still needs to run when available. See the root `skinner_implementation_checklist.md` for restart details.
