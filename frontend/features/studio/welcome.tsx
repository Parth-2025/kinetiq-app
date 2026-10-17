import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AccessibilityInfo,
  AppState,
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
  type TextStyle,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useIsFocused } from "@react-navigation/native";
import { router, type Href } from "expo-router";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/context/auth-context";
import { HeroVideo } from "./hero-video";
import type { HeroVideoHandle } from "./hero-video.types";

const C = {
  paper: "#E7E3D9",
  ink: "#192A2E",
  secondary: "#52605E",
  rule: "#AFB3AC",
  accent: "#943F2D",
};
const FONT = Platform.select({
  ios: "Helvetica Neue",
  android: "sans-serif",
  default: "Arial",
});
const films = [
  {
    name: "Tennis",
    number: "01",
    source: require("@/assets/videos/welcome/tennis.mp4"),
    poster: require("@/assets/videos/welcome/tennis.jpg"),
    ratio: 720 / 1366,
    focalX: 0.24,
    focalY: 0.7,
  },
  {
    name: "Basketball",
    number: "02",
    source: require("@/assets/videos/welcome/basketball.mp4"),
    poster: require("@/assets/videos/welcome/basketball.jpg"),
    ratio: 720 / 1366,
    focalX: 0.52,
    focalY: 0.56,
  },
  {
    name: "Running",
    number: "03",
    source: require("@/assets/videos/welcome/running.mp4"),
    poster: require("@/assets/videos/welcome/running.jpg"),
    ratio: 540 / 960,
    focalX: 0.54,
    focalY: 0.58,
  },
] as const;

function Copy({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return (
    <Text
      style={{
        color: C.ink,
        fontFamily: FONT,
        fontSize: 16,
        lineHeight: 24,
        ...style,
      }}
    >
      {children}
    </Text>
  );
}

function FlatButton({
  label,
  onPress,
  primary = false,
  disabled = false,
  busy = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  busy?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        minHeight: 50,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderWidth: 2,
        borderColor: focused ? C.accent : primary ? C.ink : C.rule,
        backgroundColor: primary ? C.ink : C.paper,
        opacity: disabled || busy ? 0.55 : 1,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Copy
        style={{
          color: primary ? C.paper : C.ink,
          fontSize: 14,
          fontWeight: "600",
        }}
      >
        {label}
      </Copy>
    </Pressable>
  );
}

function FilmPanel({
  film,
  index,
  width,
  height,
  active,
  handles,
  onPlaying,
}: {
  film: (typeof films)[number];
  index: number;
  width: number;
  height: number;
  active: boolean;
  handles: React.RefObject<(HeroVideoHandle | null)[]>;
  onPlaying: (index: number, playing: boolean) => void;
}) {
  // Crop using the same media rectangle for video and poster on every platform.
  const mediaWidth = Math.max(width, height * film.ratio);
  const mediaHeight = mediaWidth / film.ratio;
  const reportPlaying = useCallback(
    (playing: boolean) => onPlaying(index, playing),
    [index, onPlaying],
  );
  return (
    <View
      accessibilityLabel={`${film.name} training footage`}
      style={{
        width,
        height,
        overflow: "hidden",
        backgroundColor: C.ink,
        borderRightWidth: index < 2 ? 1 : 0,
        borderRightColor: C.paper,
      }}
    >
      <View
        style={{
          position: "absolute",
          width: mediaWidth,
          height: mediaHeight,
          left: (width - mediaWidth) * film.focalX,
          top: (height - mediaHeight) * film.focalY,
        }}
      >
        <HeroVideo
          ref={(handle) => {
            handles.current[index] = handle;
          }}
          source={film.source}
          poster={film.poster}
          active={active}
          onPlayingChange={reportPlaying}
        />
      </View>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          bottom: 20,
          left: width > 220 ? 24 : 8,
          right: 8,
          alignItems: "flex-start",
        }}
      >
        <View
          style={{
            backgroundColor: C.ink,
            paddingHorizontal: width > 220 ? 14 : 9,
            paddingVertical: 8,
          }}
        >
          <Copy
            style={{
              color: C.paper,
              fontSize: width > 220 ? 13 : 11,
              lineHeight: 18,
              fontWeight: "600",
              letterSpacing: 0.7,
            }}
          >
            {width > 220 ? `${film.number} / ` : ""}
            {film.name.toUpperCase()}
          </Copy>
        </View>
      </View>
    </View>
  );
}

export function WelcomePage() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= 900;
  const headerHeight = wide ? 80 : 76;
  const heroHeight = Math.max(
    380,
    height - insets.top - insets.bottom - headerHeight - 104,
  );
  const gutter = Math.max(wide ? 48 : 20, insets.left, insets.right);
  const auth = useAuth();
  const focused = useIsFocused();
  const scroll = useRef<ScrollView>(null);
  const accountY = useRef(0);
  const handles = useRef<(HeroVideoHandle | null)[]>([]);
  const [mediaWidth, setMediaWidth] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [playOverride, setPlayOverride] = useState<boolean | null>(null);
  const [appActive, setAppActive] = useState(
    AppState.currentState === "active",
  );
  const [documentVisible, setDocumentVisible] = useState(true);
  const [heroVisible, setHeroVisible] = useState(true);
  const [playing, setPlaying] = useState([false, false, false]);
  const motionAllowed = playOverride ?? !reduced;
  const shouldPlay =
    motionAllowed && appActive && documentVisible && heroVisible && focused;
  const anyPlaying = playing.some(Boolean);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setReduced(value);
      })
      .catch(() => {});
    const motion = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (value) => {
        setReduced(value);
        setPlayOverride(null);
      },
    );
    const state = AppState.addEventListener("change", (next) =>
      setAppActive(next === "active"),
    );
    return () => {
      mounted = false;
      motion.remove();
      state.remove();
    };
  }, []);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const update = () =>
      setDocumentVisible(document.visibilityState === "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    if (auth.user && auth.role && !auth.isRoleLoading && !auth.isLoading)
      router.replace((auth.role === "coach" ? "/coach" : "/(tabs)") as Href);
  }, [auth.user, auth.role, auth.isRoleLoading, auth.isLoading]);
  const reportPlaying = useCallback((index: number, value: boolean) => {
    setPlaying((previous) =>
      previous[index] === value
        ? previous
        : previous.map((p, i) => (i === index ? value : p)),
    );
  }, []);
  function togglePlayback() {
    const play = !anyPlaying;
    setPlayOverride(play);
    if (play && !heroVisible)
      scroll.current?.scrollTo({ y: headerHeight, animated: false });
    // Imperative playback also supports browsers that require a direct user gesture.
    handles.current.forEach((video) => (play ? video?.play() : video?.pause()));
  }
  function start() {
    scroll.current?.scrollTo({ y: accountY.current, animated: false });
  }
  async function choose(role: "athlete" | "coach") {
    setError(null);
    setChoosing(true);
    try {
      await auth.selectRole(role);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save your workspace.",
      );
    } finally {
      setChoosing(false);
    }
  }
  async function sign(signup: boolean) {
    setError(null);
    setBusy(true);
    try {
      await (signup ? auth.signUp() : auth.login());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in could not finish.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: C.paper }}
    >
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={100}
        onScroll={(event) =>
          setHeroVisible(
            event.nativeEvent.contentOffset.y < headerHeight + heroHeight,
          )
        }
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <View
          style={{
            minHeight: headerHeight,
            paddingHorizontal: gutter,
            paddingVertical: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 20,
          }}
        >
          <Copy
            style={{
              fontSize: wide ? 30 : 25,
              lineHeight: 36,
              fontWeight: "700",
              letterSpacing: -1.2,
            }}
          >
            KinetiQ.
          </Copy>
          {wide && (
            <Copy style={{ fontSize: 11, fontWeight: "600", letterSpacing: 2 }}>
              PERFORMANCE STUDIO
            </Copy>
          )}
          <FlatButton label="Get started" onPress={start} />
        </View>
        <View
          onLayout={(event) => setMediaWidth(event.nativeEvent.layout.width)}
          style={{ flexDirection: "row", width: "100%" }}
        >
          {films.map((film, index) => (
            <FilmPanel
              key={film.name}
              film={film}
              index={index}
              width={(mediaWidth || width) / 3}
              height={heroHeight}
              active={shouldPlay}
              handles={handles}
              onPlaying={reportPlaying}
            />
          ))}
        </View>
        <View
          style={{
            minHeight: 104,
            paddingHorizontal: gutter,
            paddingVertical: 22,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            borderBottomWidth: 1,
            borderBottomColor: C.rule,
          }}
        >
          <View style={{ flex: 1, gap: 4 }}>
            <Copy
              style={{
                fontSize: wide ? 27 : 20,
                lineHeight: wide ? 34 : 27,
                fontWeight: "600",
                letterSpacing: -0.5,
              }}
            >
              Movement, in focus.
            </Copy>
            {wide && (
              <Copy style={{ fontSize: 13, color: C.secondary }}>
                A closer look at the work you put in.
              </Copy>
            )}
          </View>
          <FlatButton
            label={anyPlaying ? "Pause videos" : "Play videos"}
            onPress={togglePlayback}
          />
        </View>
        <View
          onLayout={(event) => {
            accountY.current = event.nativeEvent.layout.y;
          }}
          style={{
            paddingHorizontal: gutter,
            paddingTop: wide ? 100 : 64,
            paddingBottom: wide ? 100 : 64,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 1200,
              alignSelf: "center",
              flexDirection: wide ? "row" : "column",
              gap: wide ? 100 : 40,
            }}
          >
            <View style={{ flex: 1, gap: 22 }}>
              <Copy
                style={{
                  color: C.accent,
                  fontSize: 11,
                  lineHeight: 16,
                  letterSpacing: 2,
                  fontWeight: "700",
                }}
              >
                KINETIQ / GET STARTED
              </Copy>
              <View accessibilityRole="header">
                <Copy
                  style={{
                    fontSize: wide ? 58 : 40,
                    lineHeight: wide ? 63 : 45,
                    fontWeight: "600",
                    letterSpacing: wide ? -2.2 : -1.3,
                  }}
                >
                  Your work{"\n"}starts here.
                </Copy>
              </View>
              <Copy
                style={{
                  color: C.secondary,
                  fontSize: 17,
                  lineHeight: 28,
                  maxWidth: 430,
                }}
              >
                A place to study your movement, build a training history, and
                work with your coach.
              </Copy>
              <Copy
                style={{
                  color: C.secondary,
                  fontSize: 13,
                  lineHeight: 22,
                  maxWidth: 410,
                }}
              >
                Start with basketball. More sports and team tracking are in
                development.
              </Copy>
            </View>
            <View style={{ flex: 1, gap: 24 }}>
              <Copy style={{ fontSize: 17, fontWeight: "600" }}>
                Choose your workspace
              </Copy>
              <View>
                {(
                  [
                    {
                      role: "athlete",
                      number: "01",
                      title: "Athlete",
                      detail: "Train on your own or connect with a team.",
                    },
                    {
                      role: "coach",
                      number: "02",
                      title: "Coach",
                      detail: "Organize athletes and review their movement.",
                    },
                  ] as const
                ).map((choice) => {
                  const selected = auth.role === choice.role;
                  return (
                    <Pressable
                      key={choice.role}
                      accessibilityRole="radio"
                      accessibilityLabel={`${choice.title}. ${choice.detail}`}
                      accessibilityState={{
                        checked: selected,
                        disabled: choosing || busy,
                      }}
                      disabled={choosing || busy}
                      onPress={() => choose(choice.role)}
                      style={{
                        paddingVertical: 22,
                        paddingHorizontal: 18,
                        minHeight: 100,
                        borderWidth: 1,
                        borderTopWidth: choice.role === "coach" ? 0 : 1,
                        borderColor: C.rule,
                        backgroundColor: selected ? C.ink : C.paper,
                        flexDirection: "row",
                        gap: 16,
                        alignItems: "center",
                      }}
                    >
                      <Copy
                        style={{
                          color: selected ? C.paper : C.secondary,
                          fontSize: 12,
                        }}
                      >
                        {choice.number}
                      </Copy>
                      <View style={{ flex: 1, gap: 5 }}>
                        <Copy
                          style={{
                            color: selected ? C.paper : C.ink,
                            fontSize: 21,
                            lineHeight: 26,
                            fontWeight: "600",
                          }}
                        >
                          {choice.title}
                        </Copy>
                        <Copy
                          style={{
                            color: selected ? C.paper : C.secondary,
                            fontSize: 14,
                            lineHeight: 21,
                          }}
                        >
                          {choice.detail}
                        </Copy>
                      </View>
                      {selected && (
                        <Copy style={{ color: C.paper, fontSize: 11 }}>
                          Selected
                        </Copy>
                      )}
                    </Pressable>
                  );
                })}
              </View>
              {(error || auth.authError) && (
                <View
                  accessibilityRole="alert"
                  style={{
                    paddingVertical: 14,
                    borderTopWidth: 1,
                    borderBottomWidth: 1,
                    borderColor: C.accent,
                  }}
                >
                  <Copy style={{ color: C.accent, fontSize: 14 }}>
                    {error ?? auth.authError}
                  </Copy>
                </View>
              )}
              {auth.isLoading || auth.isRoleLoading ? (
                <View accessibilityLiveRegion="polite">
                  <Copy style={{ color: C.secondary }}>
                    Loading your workspace…
                  </Copy>
                </View>
              ) : (
                <View style={{ gap: 12 }}>
                  <FlatButton
                    primary
                    label={
                      busy
                        ? "Connecting…"
                        : auth.user
                          ? "Continue to workspace"
                          : "Create account"
                    }
                    busy={busy}
                    disabled={!auth.role || choosing}
                    onPress={() =>
                      auth.user
                        ? router.replace(
                            (auth.role === "coach"
                              ? "/coach"
                              : "/(tabs)") as Href,
                          )
                        : sign(true)
                    }
                  />
                  {!auth.user && (
                    <FlatButton
                      label="Sign in to your account"
                      disabled={!auth.role || choosing || busy}
                      onPress={() => sign(false)}
                    />
                  )}
                </View>
              )}
              <Copy
                style={{ fontSize: 13, lineHeight: 21, color: C.secondary }}
              >
                You can switch workspaces later. A team membership is optional.
              </Copy>
            </View>
          </View>
        </View>
        <View
          style={{
            paddingTop: 24,
            marginHorizontal: gutter,
            borderTopWidth: 1,
            borderTopColor: C.rule,
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <Copy style={{ fontSize: 12, fontWeight: "600" }}>
            KinetiQ / Performance Studio
          </Copy>
          <Copy style={{ fontSize: 12, color: C.secondary }}>
            Built around your movement.
          </Copy>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
