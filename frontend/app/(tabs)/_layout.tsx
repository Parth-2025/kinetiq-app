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
