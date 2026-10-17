import { Redirect, router, type Href, usePathname } from "expo-router";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  TextInput,
  View,
  useWindowDimensions,
  type KeyboardTypeOptions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon } from "@/components/icons/Icon";
import type { IconName } from "@/components/icons/registry";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/context/auth-context";
import { useTheme } from "@/theme";

export const go = (path: string) => router.push(path as Href);

const athleteNav: [string, string, IconName][] = [
  ["Home", "/", "home"],
  ["Skills", "/skills", "basketball"],
  ["Sessions", "/sessions", "history"],
  ["Progress", "/progress", "chart"],
  ["Team", "/team", "person"],
];
const coachNav: [string, string, IconName][] = [
  ["Overview", "/coach", "home"],
  ["Teams", "/teams", "person"],
  ["Athletes", "/coach/athletes", "person"],
  ["Assignments", "/assignments", "basketball"],
  ["Practices", "/coach/practices", "camera"],
  ["Reviews", "/coach/sessions", "history"],
  ["Devices", "/devices", "settings"],
];

export function StudioScreen({
  title,
  eyebrow,
  subtitle,
  children,
  action,
  back = false,
}: {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
  back?: boolean;
}) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const { role, user, isLoading, isRoleLoading } = useAuth();
  const path = usePathname();
  const wide = width >= 1050;
  if (isLoading || isRoleLoading)
    return (
      <ActivityIndicator
        accessibilityLabel="Loading workspace"
        style={{ flex: 1 }}
      />
    );
  if (!user || !role) return <Redirect href="/login" />;
  return (
    <SafeAreaView
      edges={["top", "left", "right", "bottom"]}
      style={{ flex: 1, backgroundColor: t.color.bg }}
    >
      <View style={{ flex: 1, flexDirection: "row" }}>
        {wide && (
          <View
            style={{
              width: 224,
              borderRightWidth: 1,
              borderRightColor: t.color.stroke,
              padding: 24,
              gap: 28,
            }}
          >
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="KinetiQ home"
              onPress={() => go(role === "coach" ? "/coach" : "/")}
            >
              <Text variant="title1">
                KinetiQ<Text color="accent">.</Text>
              </Text>
              <Text variant="caption1" color="textSecondary">
                Performance Studio
              </Text>
            </Pressable>
            <View style={{ gap: 6 }}>
              <Text variant="caption1Strong" color="textSecondary">
                {role === "coach" ? "COACH WORKSPACE" : "YOUR TRAINING"}
              </Text>
              {(role === "coach" ? coachNav : athleteNav).map(
                ([label, href, icon]) => (
                  <Pressable
                    key={href}
                    accessibilityRole="link"
                    accessibilityState={{ selected: path === href }}
                    onPress={() => go(href)}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      gap: 12,
                      alignItems: "center",
                      minHeight: 46,
                      paddingHorizontal: 12,
                      borderRadius: 0,
                      backgroundColor:
                        path === href
                          ? t.color.accentSubtle
                          : pressed
                            ? t.color.layerAlt
                            : "transparent",
                    })}
                  >
                    <Icon
                      name={icon}
                      size={20}
                      color={path === href ? "accent" : "textSecondary"}
                    />
                    <Text
                      variant="body1Strong"
                      color={path === href ? "accent" : "textSecondary"}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ),
              )}
            </View>
            <View style={{ flex: 1 }} />
            <Button
              label="Settings"
              icon="settings"
              appearance="subtle"
              onPress={() => go("/settings")}
            />
          </View>
        )}
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: wide ? 36 : 20,
            paddingBottom: 48,
            gap: 28,
            maxWidth: 1440,
            width: "100%",
            alignSelf: "center",
          }}
        >
          {!wide && (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text variant="subtitle1">
                KinetiQ<Text color="accent">.</Text>
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open settings"
                onPress={() => go("/settings")}
                style={{ padding: 12 }}
              >
                <Icon name="person" size={22} />
              </Pressable>
            </View>
          )}
          {back && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() =>
                router.canGoBack()
                  ? router.back()
                  : go(role === "coach" ? "/coach" : "/")
              }
              style={{
                flexDirection: "row",
                gap: 8,
                alignItems: "center",
                minHeight: 44,
              }}
            >
              <Icon name="chevron-left" size={18} />
              <Text color="textSecondary">Back</Text>
            </Pressable>
          )}
          <View
            style={{
              flexDirection: wide ? "row" : "column",
              justifyContent: "space-between",
              alignItems: wide ? "center" : "stretch",
              gap: 16,
            }}
          >
            <View style={{ flex: 1, gap: 8 }}>
              {eyebrow && (
                <Text
                  variant="caption1Strong"
                  color="accent"
                  style={{ letterSpacing: 1.5 }}
                >
                  {eyebrow.toUpperCase()}
                </Text>
              )}
              <Text
                variant="display"
                style={{ fontSize: wide ? 36 : 30, lineHeight: wide ? 44 : 38 }}
              >
                {title}
              </Text>
              {subtitle && (
                <Text
                  color="textSecondary"
                  style={{ maxWidth: 680, lineHeight: 24 }}
                >
                  {subtitle}
                </Text>
              )}
            </View>
            {action}
          </View>
          {children}
        </ScrollView>
      </View>
      {!wide && (
        <View
          style={{
            flexDirection: "row",
            borderTopWidth: 1,
            borderTopColor: t.color.stroke,
            backgroundColor: t.color.layer,
          }}
        >
          {(role === "coach"
            ? coachNav.filter(([label]) =>
                ["Overview", "Athletes", "Practices", "Reviews"].includes(
                  label,
                ),
              )
            : athleteNav
          ).map(([label, href, icon]) => (
            <Pressable
              key={href}
              accessibilityRole="link"
              accessibilityLabel={label}
              accessibilityState={{ selected: path === href }}
              onPress={() => go(href)}
              style={{
                flex: 1,
                minHeight: 64,
                paddingVertical: 10,
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
              }}
            >
              <Icon
                name={icon}
                size={21}
                color={path === href ? "accent" : "textSecondary"}
              />
              <Text
                variant="caption1"
                color={path === href ? "accent" : "textSecondary"}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}

export function Panel({
  children,
  title,
  action,
}: {
  children: ReactNode;
  title?: string;
  action?: ReactNode;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        backgroundColor: t.color.layer,
        borderColor: t.color.stroke,
        borderWidth: 1,
        borderRadius: 0,
        padding: 22,
        gap: 18,
      }}
    >
      {title && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <Text variant="title3" style={{ flex: 1 }}>
            {title}
          </Text>
          {action}
        </View>
      )}
      {children}
    </View>
  );
}

export function Columns({
  main,
  aside,
}: {
  main: ReactNode;
  aside: ReactNode;
}) {
  const { width } = useWindowDimensions();
  return (
    <View style={{ flexDirection: width >= 1000 ? "row" : "column", gap: 24 }}>
      <View style={{ flex: 2, gap: 24, minWidth: 0 }}>{main}</View>
      <View style={{ flex: 1, gap: 24, minWidth: 0 }}>{aside}</View>
    </View>
  );
}

export function Row({
  title,
  detail,
  meta,
  onPress,
  icon = "chevron-right",
}: {
  title: string;
  detail?: string;
  meta?: string;
  onPress?: () => void;
  icon?: IconName;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={[title, detail, meta].filter(Boolean).join(", ")}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        gap: 16,
        alignItems: "center",
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: t.color.strokeSoft,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ flex: 1, gap: 5 }}>
        <Text variant="body1Strong">{title}</Text>
        {detail && (
          <Text
            variant="caption1"
            color="textSecondary"
            style={{ lineHeight: 19 }}
          >
            {detail}
          </Text>
        )}
      </View>
      {meta && <Badge label={meta} />}{" "}
      {onPress && <Icon name={icon} size={18} color="textSecondary" />}
    </Pressable>
  );
}

export function Badge({
  label,
  accent = false,
}: {
  label: string;
  accent?: boolean;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        alignSelf: "flex-start",
        paddingVertical: 5,
        paddingHorizontal: 9,
        backgroundColor: accent ? t.color.accentSubtle : t.color.layerAlt,
        borderRadius: 0,
      }}
    >
      <Text
        variant="caption1Strong"
        color={accent ? "accent" : "textSecondary"}
      >
        {label.replaceAll("_", " ")}
      </Text>
    </View>
  );
}

export function Empty({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <View style={{ gap: 12, paddingVertical: 24, maxWidth: 560 }}>
      <Text variant="title3">{title}</Text>
      <Text color="textSecondary" style={{ lineHeight: 24 }}>
        {detail}
      </Text>
      {action && (
        <View style={{ alignSelf: "flex-start", marginTop: 8 }}>{action}</View>
      )}
    </View>
  );
}

export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  const t = useTheme();
  return (
    <View
      accessibilityRole={error ? "alert" : undefined}
      style={{
        backgroundColor: error ? t.color.dangerSubtle : t.color.layerAlt,
        borderRadius: 0,
        padding: 16,
        gap: 8,
      }}
    >
      <Text
        color={error ? "danger" : "textSecondary"}
        style={{ lineHeight: 22 }}
      >
        {children}
      </Text>
    </View>
  );
}

export function QueryState({
  query,
}: {
  query: {
    isLoading: boolean;
    error: Error | null;
    refetch: () => void;
    value: unknown;
  };
}) {
  const t = useTheme();
  if (query.error)
    return (
      <View style={{ gap: 12 }}>
        <Notice error>{query.error.message}</Notice>
        <Button
          label="Try again"
          appearance="outline"
          onPress={query.refetch}
        />
      </View>
    );
  if (query.isLoading && !query.value)
    return (
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Loading"
        style={{ padding: 28 }}
      >
        <ActivityIndicator color={t.color.accent} />
      </View>
    );
  return null;
}

export function Input({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  keyboardType = "default",
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: KeyboardTypeOptions;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text variant="body1Strong">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.color.textSecondary}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize="sentences"
        style={{
          backgroundColor: t.color.layer,
          borderWidth: 1,
          borderColor: t.color.stroke,
          borderRadius: 0,
          minHeight: multiline ? 112 : 50,
          textAlignVertical: multiline ? "top" : "center",
          padding: 14,
          color: t.color.text,
          fontSize: 16,
          fontFamily: t.fonts.sans,
        }}
      />
    </View>
  );
}

export function Choices({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((option) => (
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: option.value === value }}
          key={option.value}
          onPress={() => onChange(option.value)}
          style={{
            minHeight: 44,
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderWidth: 1,
            borderColor:
              option.value === value ? t.color.accent : t.color.stroke,
            backgroundColor:
              option.value === value ? t.color.accentSubtle : t.color.layer,
            borderRadius: 0,
          }}
        >
          <Text color={option.value === value ? "accent" : "textSecondary"}>
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function ActionError({ message }: { message: string | null }) {
  return message ? <Notice error>{message}</Notice> : null;
}
