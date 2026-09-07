import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  APP_BG,
  APP_TEXT,
  APP_TEXT_MUTED,
} from '@/constants/colors';

/**
 * B2: leaderboards, friends, social messaging and the cosmetics shop return in
 * sub-project B2. Until then these routes render a centered placeholder.
 */
export function ComingSoon({ title, body }: { title: string; body?: string }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.center}>
        <Text style={styles.title}>{title}</Text>
        {body ? <Text style={styles.body}>{body}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: APP_BG,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  title: {
    color: APP_TEXT,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  body: {
    color: APP_TEXT_MUTED,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
});
