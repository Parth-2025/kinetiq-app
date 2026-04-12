import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AvatarArtwork,
  BannerArtwork,
  formatPointsValue,
  formatPriceLabel,
  getAvatarById,
  getBannerById,
  normalizeProfileCustomization,
  SHOP_AVATARS,
  SHOP_BANNERS,
  type AvatarCosmetic,
  type BannerCosmetic,
  type ProfileCustomizationState,
  type ShopTab,
} from '@/components/profile-cosmetics';
import {
  APP_OVERLAY,
  APP_SHADOW,
  APP_SURFACE,
  APP_SURFACE_ALT,
  APP_TEXT_MUTED,
  APP_BORDER_SOFT,
  HOME_BG,
  HOME_CARD,
  HOME_LABEL,
  HOME_TEXT,
  PURPLE,
  WHITE,
  WHITE_12,
  WHITE_18,
  WHITE_72,
  WHITE_82,
} from '@/constants/colors';
import { useAuth } from '@/context/auth-context';
import { useProfileCustomization } from '@/hooks/use-profile-customization';

export default function ShopScreen() {
  const { user } = useAuth();
  const { customization, isLoading, isSaving, saveCustomization } = useProfileCustomization(user?.sub);
  const { width: screenWidth } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<ShopTab>('avatars');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [pendingPurchase, setPendingPurchase] = useState<
    | { tab: 'avatars'; item: AvatarCosmetic }
    | { tab: 'banners'; item: BannerCosmetic }
    | null
  >(null);

  async function updateCustomization(next: ProfileCustomizationState, message: string) {
    setStatusMessage(null);
    try {
      await saveCustomization(normalizeProfileCustomization(next));
      setStatusMessage(message);
    } catch {
      setStatusMessage('We could not save your shop changes. Please try again.');
    }
  }

  async function handleAvatarPress(item: AvatarCosmetic) {
    const isOwned = customization.ownedAvatarIds.includes(item.id);

    if (isOwned) {
      if (customization.equippedAvatarId === item.id) {
        setStatusMessage(`${item.name} is already equipped.`);
        return;
      }

      await updateCustomization(
        {
          ...customization,
          equippedAvatarId: item.id,
        },
        `${item.name} equipped.`,
      );
      return;
    }

    setPendingPurchase({ tab: 'avatars', item });
  }

  async function handleBannerPress(item: BannerCosmetic) {
    const isOwned = customization.ownedBannerIds.includes(item.id);

    if (isOwned) {
      if (customization.equippedBannerId === item.id) {
        setStatusMessage(`${item.name} is already equipped.`);
        return;
      }

      await updateCustomization(
        {
          ...customization,
          equippedBannerId: item.id,
        },
        `${item.name} equipped.`,
      );
      return;
    }

    setPendingPurchase({ tab: 'banners', item });
  }

  async function confirmPurchase() {
    if (!pendingPurchase) {
      return;
    }

    const { item } = pendingPurchase;

    if (customization.points < item.price) {
      setPendingPurchase(null);
      setStatusMessage(`You need ${item.price - customization.points} more points to unlock ${item.name}.`);
      return;
    }

    if (pendingPurchase.tab === 'avatars') {
      await updateCustomization(
        {
          ...customization,
          points: customization.points - item.price,
          ownedAvatarIds: [...customization.ownedAvatarIds, item.id],
          equippedAvatarId: item.id,
        },
        `${item.name} unlocked and equipped.`,
      );
    } else {
      await updateCustomization(
        {
          ...customization,
          points: customization.points - item.price,
          ownedBannerIds: [...customization.ownedBannerIds, item.id],
          equippedBannerId: item.id,
        },
        `${item.name} unlocked and equipped.`,
      );
    }

    setPendingPurchase(null);
  }

  const equippedAvatar = getAvatarById(customization.equippedAvatarId);
  const equippedBanner = getBannerById(customization.equippedBannerId);
  const avatarCardWidth = Math.floor((screenWidth - 78) / 2);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Shop</Text>
          <Text style={styles.heroSubtitle}>Profile customization</Text>

          <View style={styles.pointsCard}>
            <View>
              <Text style={styles.pointsLabel}>Your Points</Text>
              <Text style={styles.pointsHint}>Spend points on avatars and banners.</Text>
            </View>
            <Text style={styles.pointsValue}>{formatPointsValue(customization.points)}</Text>
          </View>

          <View style={styles.previewShell}>
            <BannerArtwork banner={equippedBanner} height={104} />
            <View style={styles.previewAvatar}>
              <AvatarArtwork avatar={equippedAvatar} size={92} />
            </View>
          </View>
        </View>

        <View style={styles.panel}>
          <View style={styles.tabRow}>
            <Pressable
              onPress={() => setActiveTab('avatars')}
              style={[styles.tabButton, activeTab === 'avatars' && styles.tabButtonActive]}
            >
              <MaterialIcons
                name="person-outline"
                size={22}
                color={activeTab === 'avatars' ? PURPLE : HOME_LABEL}
              />
              <Text style={[styles.tabLabel, activeTab === 'avatars' && styles.tabLabelActive]}>
                Avatars
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab('banners')}
              style={[styles.tabButton, activeTab === 'banners' && styles.tabButtonActive]}
            >
              <MaterialIcons
                name="photo-library"
                size={22}
                color={activeTab === 'banners' ? PURPLE : HOME_LABEL}
              />
              <Text style={[styles.tabLabel, activeTab === 'banners' && styles.tabLabelActive]}>
                Banners
              </Text>
            </Pressable>
          </View>

          {statusMessage ? <Text style={styles.statusMessage}>{statusMessage}</Text> : null}
          {isLoading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="small" color={PURPLE} />
              <Text style={styles.loadingText}>Loading your customizations...</Text>
            </View>
          ) : null}

          {activeTab === 'avatars' ? (
            <View style={styles.avatarGrid}>
              {SHOP_AVATARS.map((item) => {
                const isOwned = customization.ownedAvatarIds.includes(item.id);
                const isEquipped = customization.equippedAvatarId === item.id;

                return (
                  <Pressable
                    key={item.id}
                    style={[
                      styles.avatarCard,
                      { width: avatarCardWidth },
                      isEquipped && styles.selectedCard,
                    ]}
                    onPress={() => handleAvatarPress(item)}
                    disabled={isSaving}
                  >
                    <View style={styles.checkBadge}>
                      {isEquipped ? (
                        <MaterialIcons name="check" size={16} color={WHITE} />
                      ) : null}
                    </View>
                    <AvatarArtwork avatar={item} size={112} />
                    <Text style={styles.cardTitle}>{item.name}</Text>
                    <Text style={styles.cardSubtitle}>{item.title}</Text>
                    <Text style={[styles.priceText, isOwned && styles.priceOwned]}>
                      {isOwned ? (isEquipped ? 'Equipped' : 'Owned') : formatPriceLabel(item.price)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={styles.bannerList}>
              {SHOP_BANNERS.map((item) => {
                const isOwned = customization.ownedBannerIds.includes(item.id);
                const isEquipped = customization.equippedBannerId === item.id;

                return (
                  <Pressable
                    key={item.id}
                    style={[
                      styles.bannerCard,
                      isEquipped && styles.selectedCard,
                    ]}
                    onPress={() => handleBannerPress(item)}
                    disabled={isSaving}
                  >
                    <View style={styles.bannerCheckBadge}>
                      {isEquipped ? (
                        <MaterialIcons name="check" size={16} color={WHITE} />
                      ) : null}
                    </View>
                    <BannerArtwork banner={item} />
                    <View style={styles.bannerMetaRow}>
                      <View>
                        <Text style={styles.cardTitle}>{item.name}</Text>
                        <Text style={styles.cardSubtitle}>
                          {isOwned ? 'Ready for your messages' : 'Unlock this banner style'}
                        </Text>
                      </View>
                      <Text style={[styles.priceText, isOwned && styles.priceOwned]}>
                        {isOwned ? (isEquipped ? 'Equipped' : 'Owned') : formatPriceLabel(item.price)}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={!!pendingPurchase}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingPurchase(null)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setPendingPurchase(null)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.modal}>
            <Text style={styles.modalTitle}>Buy {pendingPurchase?.item.name}?</Text>
            <Text style={styles.modalSubtitle}>
              Spend {pendingPurchase ? formatPriceLabel(pendingPurchase.item.price).toLowerCase() : '0 pts'} to unlock this
              {pendingPurchase?.tab === 'avatars' ? ' avatar' : ' banner'} and equip it right away.
            </Text>
            <View style={styles.modalCostRow}>
              <Text style={styles.modalCostLabel}>Current balance</Text>
              <Text style={styles.modalCostValue}>{formatPointsValue(customization.points)} pts</Text>
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() => setPendingPurchase(null)}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.addBtn]}
                onPress={confirmPurchase}
                disabled={isSaving}
              >
                <Text style={styles.addText}>Confirm Purchase</Text>
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
  content: {
    paddingBottom: 32,
  },
  hero: {
    backgroundColor: PURPLE,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 74,
    borderBottomLeftRadius: 34,
    borderBottomRightRadius: 34,
  },
  heroTitle: {
    fontSize: 42,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -1.2,
  },
  heroSubtitle: {
    marginTop: 6,
    fontSize: 19,
    fontWeight: '600',
    color: WHITE_82,
  },
  pointsCard: {
    marginTop: 22,
    borderRadius: 22,
    backgroundColor: WHITE_18,
    paddingHorizontal: 18,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pointsLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: WHITE,
  },
  pointsHint: {
    marginTop: 4,
    fontSize: 12,
    color: WHITE_72,
  },
  pointsValue: {
    fontSize: 36,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -1,
  },
  previewShell: {
    marginTop: 20,
    borderRadius: 28,
    padding: 10,
    backgroundColor: WHITE_12,
  },
  previewAvatar: {
    position: 'absolute',
    bottom: -12,
    left: 18,
    padding: 4,
    borderRadius: 52,
    backgroundColor: APP_SURFACE,
  },
  panel: {
    marginTop: -42,
    marginHorizontal: 18,
    backgroundColor: HOME_CARD,
    borderRadius: 30,
    paddingTop: 14,
    paddingBottom: 12,
    shadowColor: APP_SHADOW,
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    gap: 10,
  },
  tabButton: {
    flex: 1,
    height: 96,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: APP_BORDER_SOFT,
  },
  tabButtonActive: {
    borderColor: PURPLE,
    backgroundColor: APP_SURFACE_ALT,
  },
  tabLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: HOME_LABEL,
  },
  tabLabelActive: {
    color: PURPLE,
  },
  statusMessage: {
    paddingHorizontal: 20,
    paddingTop: 16,
    fontSize: 14,
    color: PURPLE,
    fontWeight: '600',
  },
  loadingState: {
    paddingTop: 20,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: HOME_LABEL,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 14,
    paddingHorizontal: 14,
    paddingTop: 18,
  },
  avatarCard: {
    backgroundColor: APP_SURFACE_ALT,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: APP_BORDER_SOFT,
    position: 'relative',
  },
  selectedCard: {
    borderColor: PURPLE,
    backgroundColor: APP_SURFACE,
  },
  checkBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    marginTop: 14,
    fontSize: 22,
    fontWeight: '800',
    color: HOME_TEXT,
    letterSpacing: -0.6,
  },
  cardSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: HOME_LABEL,
    fontWeight: '600',
  },
  priceText: {
    marginTop: 10,
    fontSize: 16,
    color: PURPLE,
    fontWeight: '800',
  },
  priceOwned: {
    color: HOME_TEXT,
  },
  bannerList: {
    gap: 14,
    paddingHorizontal: 14,
    paddingTop: 18,
  },
  bannerCard: {
    backgroundColor: APP_SURFACE_ALT,
    borderRadius: 24,
    padding: 14,
    borderWidth: 2,
    borderColor: APP_BORDER_SOFT,
    position: 'relative',
  },
  bannerCheckBadge: {
    position: 'absolute',
    top: 18,
    right: 18,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  bannerMetaRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
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
  },
  modalCostRow: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: APP_SURFACE_ALT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalCostLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: APP_TEXT_MUTED,
  },
  modalCostValue: {
    fontSize: 15,
    fontWeight: '800',
    color: PURPLE,
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
    backgroundColor: HOME_BG,
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
