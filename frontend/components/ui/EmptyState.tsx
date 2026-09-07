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
