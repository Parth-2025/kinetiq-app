import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ACCENT_SURFACE_ALT,
  APP_BORDER,
  APP_OVERLAY,
  APP_SHADOW,
  APP_SURFACE_SUBTLE,
  HOME_BG,
  HOME_CARD,
  HOME_LABEL,
  HOME_TEXT,
  PURPLE,
  WHITE,
} from '@/constants/colors';
import { invalidate, useApiMutation, useApiQuery } from '@/hooks/use-api';

const SPORTS = [
  { name: 'Basketball', emoji: '🏀' },
  { name: 'Soccer',     emoji: '⚽' },
  { name: 'Tennis',     emoji: '🎾' },
  { name: 'Baseball',   emoji: '⚾' },
  { name: 'Football',   emoji: '🏈' },
  { name: 'Volleyball', emoji: '🏐' },
  { name: 'Swimming',   emoji: '🏊' },
];

type SportsState = { active: string | null; selected: string[] };

export default function SportsScreen() {
  const { value: sportsState } = useApiQuery<SportsState>('sports', '/me/sports');
  const activeSport = sportsState?.active ?? null;
  const selectedSports = new Set(sportsState?.selected ?? []);

  const addSport = useApiMutation<SportsState>('/me/sports/selected', 'POST');
  const setActive = useApiMutation<SportsState>('/me/sports/active', 'PUT');

  const [confirmSport, setConfirmSport] = useState<{ name: string; emoji: string } | null>(null);

  async function handleSportPress(sport: { name: string; emoji: string }) {
    const s = sport.name.toLowerCase();
    if (selectedSports.has(sport.name) || selectedSports.has(s)) {
      try {
        await setActive.mutate({ sport: s });
        invalidate('sports');
      } catch {
        Alert.alert("Couldn't update sports", 'Please check your connection and try again.');
      }
    } else {
      setConfirmSport(sport);
    }
  }

  async function handleAddSport() {
    if (!confirmSport) return;
    try {
      await addSport.mutate({ sport: confirmSport.name.toLowerCase() });
      invalidate('sports');
    } catch {
      Alert.alert("Couldn't update sports", 'Please check your connection and try again.');
    } finally {
      setConfirmSport(null);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>My Sports</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>Tap to switch or add sports</Text>

        {/* ── Sport list card ── */}
        <View style={styles.listCard}>
          {SPORTS.map((sport, index) => {
            const s = sport.name.toLowerCase();
            const isSelected = selectedSports.has(sport.name) || selectedSports.has(s);
            const isActive = activeSport === s;
            return (
              <TouchableOpacity
                key={sport.name}
                style={[
                  styles.row,
                  index < SPORTS.length - 1 && styles.rowBorder,
                  isActive && styles.rowActive,
                ]}
                onPress={() => handleSportPress(sport)}
                activeOpacity={0.7}
              >
                <Text style={styles.emoji}>{sport.emoji}</Text>
                <Text style={styles.sportName}>{sport.name}</Text>
                {isActive && (
                  <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>Active</Text>
                  </View>
                )}
                <View style={styles.rowRight}>
                  {isSelected ? (
                    <Text style={styles.checkmark}>✓</Text>
                  ) : (
                    <Text style={styles.plus}>+</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* ── Confirm Add Modal ── */}
      <Modal
        visible={!!confirmSport}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmSport(null)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setConfirmSport(null)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.modal}>
            <Text style={styles.modalTitle}>Add {confirmSport?.name}?</Text>
            <Text style={styles.modalSubtitle}>
              Start tracking your {confirmSport?.name} rankings and stats
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() => setConfirmSport(null)}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.addBtn]}
                onPress={handleAddSport}
              >
                <Text style={styles.addText}>Add Sport</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: HOME_BG,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: APP_BORDER,
    backgroundColor: HOME_BG,
  },
  backBtn: {
    width: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  backArrow: {
    fontSize: 32,
    color: PURPLE,
    lineHeight: 36,
    marginTop: -4,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: HOME_TEXT,
    letterSpacing: -0.3,
  },

  // Body
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
    gap: 16,
  },
  subtitle: {
    fontSize: 14,
    color: HOME_LABEL,
    fontWeight: '400',
  },

  // List card
  listCard: {
    backgroundColor: HOME_CARD,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: APP_SHADOW,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 14,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: APP_BORDER,
  },
  rowActive: {
    backgroundColor: ACCENT_SURFACE_ALT,
  },
  emoji: {
    fontSize: 26,
    lineHeight: 32,
  },
  sportName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: HOME_TEXT,
    letterSpacing: -0.2,
  },
  activeBadge: {
    backgroundColor: PURPLE,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  activeBadgeText: {
    color: WHITE,
    fontSize: 12,
    fontWeight: '600',
  },
  rowRight: {
    width: 28,
    alignItems: 'center',
  },
  checkmark: {
    fontSize: 20,
    color: PURPLE,
    fontWeight: '700',
  },
  plus: {
    fontSize: 22,
    color: HOME_LABEL,
    fontWeight: '300',
  },

  // Modal
  overlay: {
    flex: 1,
    backgroundColor: APP_OVERLAY,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  modal: {
    width: '100%',
    backgroundColor: HOME_CARD,
    borderRadius: 24,
    padding: 24,
    gap: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: HOME_TEXT,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: HOME_LABEL,
    lineHeight: 20,
    marginBottom: 8,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalBtn: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    backgroundColor: APP_SURFACE_SUBTLE,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: HOME_TEXT,
  },
  addBtn: {
    backgroundColor: PURPLE,
  },
  addText: {
    fontSize: 16,
    fontWeight: '600',
    color: WHITE,
  },
});
