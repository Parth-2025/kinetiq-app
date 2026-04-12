import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, Text, View } from 'react-native';

export type ShopTab = 'avatars' | 'banners';

export interface AvatarCosmetic {
  id: string;
  name: string;
  price: number;
  initials: string;
  title: string;
  shellColor: string;
  coreColor: string;
  accentColor: string;
}

export interface BannerCosmetic {
  id: string;
  name: string;
  price: number;
  baseColor: string;
  topGlow: string;
  accentColor: string;
  pattern: 'orbit' | 'wave' | 'grid' | 'spark';
}

export interface ProfileCustomizationState {
  points: number;
  ownedAvatarIds: string[];
  ownedBannerIds: string[];
  equippedAvatarId: string;
  equippedBannerId: string;
}

export const SHOP_AVATARS: AvatarCosmetic[] = [
  {
    id: 'nova',
    name: 'Nova',
    price: 0,
    initials: 'N',
    title: 'Starter',
    shellColor: '#6C47FF',
    coreColor: '#F4F1FF',
    accentColor: '#C4B5FD',
  },
  {
    id: 'ember',
    name: 'Ember',
    price: 450,
    initials: 'E',
    title: 'Hot streak',
    shellColor: '#F97316',
    coreColor: '#FFF1E8',
    accentColor: '#FDBA74',
  },
  {
    id: 'tidal',
    name: 'Tidal',
    price: 725,
    initials: 'T',
    title: 'Calm control',
    shellColor: '#0EA5E9',
    coreColor: '#E0F2FE',
    accentColor: '#67E8F9',
  },
  {
    id: 'volt',
    name: 'Volt',
    price: 980,
    initials: 'V',
    title: 'Game day',
    shellColor: '#10B981',
    coreColor: '#ECFDF5',
    accentColor: '#6EE7B7',
  },
];

export const SHOP_BANNERS: BannerCosmetic[] = [
  {
    id: 'midnight',
    name: 'Midnight',
    price: 0,
    baseColor: '#4C1D95',
    topGlow: '#7C3AED',
    accentColor: '#8B5CF6',
    pattern: 'orbit',
  },
  {
    id: 'waveform',
    name: 'Waveform',
    price: 750,
    baseColor: '#0EA5E9',
    topGlow: '#2563EB',
    accentColor: '#67E8F9',
    pattern: 'wave',
  },
  {
    id: 'gridline',
    name: 'Gridline',
    price: 1125,
    baseColor: '#111827',
    topGlow: '#374151',
    accentColor: '#F59E0B',
    pattern: 'grid',
  },
  {
    id: 'sunburst',
    name: 'Sunburst',
    price: 1400,
    baseColor: '#BE123C',
    topGlow: '#FB7185',
    accentColor: '#FDBA74',
    pattern: 'spark',
  },
];

export const INITIAL_PROFILE_CUSTOMIZATION: ProfileCustomizationState = {
  points: 2389,
  ownedAvatarIds: ['nova'],
  ownedBannerIds: ['midnight'],
  equippedAvatarId: 'nova',
  equippedBannerId: 'midnight',
};

const avatarIds = new Set(SHOP_AVATARS.map((item) => item.id));
const bannerIds = new Set(SHOP_BANNERS.map((item) => item.id));

function uniqueValidIds(ids: unknown, allowedIds: Set<string>, fallbackId: string) {
  if (!Array.isArray(ids)) {
    return [fallbackId];
  }

  const filtered = ids.filter((value): value is string => typeof value === 'string' && allowedIds.has(value));
  const unique = Array.from(new Set(filtered));
  return unique.length > 0 ? unique : [fallbackId];
}

export function normalizeProfileCustomization(
  value: Partial<ProfileCustomizationState> | null | undefined,
): ProfileCustomizationState {
  const ownedAvatarIds = uniqueValidIds(
    value?.ownedAvatarIds,
    avatarIds,
    INITIAL_PROFILE_CUSTOMIZATION.ownedAvatarIds[0],
  );
  const ownedBannerIds = uniqueValidIds(
    value?.ownedBannerIds,
    bannerIds,
    INITIAL_PROFILE_CUSTOMIZATION.ownedBannerIds[0],
  );

  const equippedAvatarId = typeof value?.equippedAvatarId === 'string' && ownedAvatarIds.includes(value.equippedAvatarId)
    ? value.equippedAvatarId
    : ownedAvatarIds[0];
  const equippedBannerId = typeof value?.equippedBannerId === 'string' && ownedBannerIds.includes(value.equippedBannerId)
    ? value.equippedBannerId
    : ownedBannerIds[0];

  return {
    points: typeof value?.points === 'number' ? value.points : INITIAL_PROFILE_CUSTOMIZATION.points,
    ownedAvatarIds,
    ownedBannerIds,
    equippedAvatarId,
    equippedBannerId,
  };
}

export function getAvatarById(id: string) {
  return SHOP_AVATARS.find((item) => item.id === id) ?? SHOP_AVATARS[0];
}

export function getBannerById(id: string) {
  return SHOP_BANNERS.find((item) => item.id === id) ?? SHOP_BANNERS[0];
}

export function formatPriceLabel(price: number) {
  return price === 0 ? 'Free' : `${price.toLocaleString()} pts`;
}

export function formatPointsValue(points: number) {
  return points.toLocaleString();
}

export function AvatarArtwork({
  avatar,
  size = 96,
}: {
  avatar: AvatarCosmetic;
  size?: number;
}) {
  const ringSize = size;
  const coreSize = Math.round(size * 0.78);
  const labelSize = Math.round(size * 0.33);

  return (
    <View
      style={[
        styles.avatarOuter,
        {
          width: ringSize,
          height: ringSize,
          borderRadius: ringSize / 2,
          backgroundColor: avatar.shellColor,
        },
      ]}
    >
      <View
        style={[
          styles.avatarGlow,
          {
            width: ringSize * 0.84,
            height: ringSize * 0.84,
            borderRadius: ringSize * 0.42,
            backgroundColor: avatar.accentColor,
            top: ringSize * 0.08,
            left: ringSize * 0.08,
          },
        ]}
      />
      <View
        style={[
          styles.avatarInner,
          {
            width: coreSize,
            height: coreSize,
            borderRadius: coreSize / 2,
            backgroundColor: avatar.coreColor,
          },
        ]}
      >
        <View
          style={[
            styles.avatarAccentOrb,
            {
              width: coreSize * 0.28,
              height: coreSize * 0.28,
              borderRadius: (coreSize * 0.28) / 2,
              backgroundColor: avatar.accentColor,
              top: coreSize * 0.16,
              right: coreSize * 0.12,
            },
          ]}
        />
        <View
          style={[
            styles.avatarAccentBar,
            {
              width: coreSize * 0.64,
              borderRadius: coreSize * 0.18,
              backgroundColor: avatar.shellColor,
            },
          ]}
        />
        <Text style={[styles.avatarInitials, { fontSize: labelSize, color: avatar.shellColor }]}>
          {avatar.initials}
        </Text>
      </View>
    </View>
  );
}

export function BannerArtwork({
  banner,
  height = 108,
}: {
  banner: BannerCosmetic;
  height?: number;
}) {
  return (
    <View
      style={[
        styles.bannerBase,
        {
          height,
          backgroundColor: banner.baseColor,
          borderRadius: 22,
        },
      ]}
    >
      <View
        style={[
          styles.bannerGlow,
          {
            backgroundColor: banner.topGlow,
          },
        ]}
      />
      {banner.pattern === 'orbit' ? (
        <>
          <View style={[styles.orbitRing, { borderColor: `${banner.accentColor}99` }]} />
          <View style={[styles.orbitDot, { backgroundColor: banner.accentColor }]} />
        </>
      ) : null}
      {banner.pattern === 'wave' ? (
        <>
          <View style={[styles.waveBandPrimary, { backgroundColor: `${banner.accentColor}66` }]} />
          <View style={[styles.waveBandSecondary, { borderColor: `${banner.accentColor}AA` }]} />
        </>
      ) : null}
      {banner.pattern === 'grid' ? (
        <>
          <View style={[styles.gridOverlay, { borderColor: `${banner.accentColor}55` }]} />
          <View style={[styles.gridOverlayInset, { borderColor: `${banner.accentColor}44` }]} />
        </>
      ) : null}
      {banner.pattern === 'spark' ? (
        <>
          <MaterialIcons
            name="auto-awesome"
            size={30}
            color={banner.accentColor}
            style={styles.sparkPrimary}
          />
          <MaterialIcons
            name="auto-awesome"
            size={18}
            color={`${banner.accentColor}CC`}
            style={styles.sparkSecondary}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  avatarOuter: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarGlow: {
    position: 'absolute',
    opacity: 0.28,
  },
  avatarInner: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarAccentOrb: {
    position: 'absolute',
    opacity: 0.75,
  },
  avatarAccentBar: {
    position: 'absolute',
    height: '18%',
    bottom: '20%',
    opacity: 0.14,
  },
  avatarInitials: {
    fontWeight: '800',
    letterSpacing: -1,
  },
  bannerBase: {
    overflow: 'hidden',
    position: 'relative',
  },
  bannerGlow: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.7,
    transform: [{ translateX: 18 }, { translateY: -14 }],
  },
  orbitRing: {
    position: 'absolute',
    width: 116,
    height: 116,
    borderRadius: 58,
    borderWidth: 2,
    top: -10,
    right: 12,
  },
  orbitDot: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    top: 30,
    right: 26,
  },
  waveBandPrimary: {
    position: 'absolute',
    width: '72%',
    height: 84,
    borderRadius: 42,
    bottom: -32,
    left: -12,
    transform: [{ rotate: '-8deg' }],
  },
  waveBandSecondary: {
    position: 'absolute',
    width: '82%',
    height: 92,
    borderRadius: 46,
    bottom: -38,
    right: -18,
    borderWidth: 3,
    transform: [{ rotate: '10deg' }],
  },
  gridOverlay: {
    position: 'absolute',
    inset: 18,
    borderWidth: 1,
    borderRadius: 18,
  },
  gridOverlayInset: {
    position: 'absolute',
    inset: 34,
    borderWidth: 1,
    borderRadius: 12,
  },
  sparkPrimary: {
    position: 'absolute',
    top: 22,
    right: 28,
  },
  sparkSecondary: {
    position: 'absolute',
    bottom: 20,
    left: 24,
  },
});
