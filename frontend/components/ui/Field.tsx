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
          accessibilityLabel={label}
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
