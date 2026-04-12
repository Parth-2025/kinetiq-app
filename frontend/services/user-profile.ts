import { get, ref, remove, set } from 'firebase/database';

import { db } from '@/config/firebase';
import { formatUserId } from '@/utils/user';

export interface AppUserProfile {
  username: string;
  displayName: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
}

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 20;
const USERNAME_PATTERN = /^[a-z0-9._]+$/;

export function getUserProfilePath(userSub: string | null | undefined) {
  return `users/${formatUserId(userSub)}/profile`;
}

export function normalizeUsernameInput(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9._]/g, '')
    .slice(0, USERNAME_MAX_LENGTH);
}

export function isValidUsername(username: string) {
  return (
    username.length >= USERNAME_MIN_LENGTH &&
    username.length <= USERNAME_MAX_LENGTH &&
    USERNAME_PATTERN.test(username)
  );
}

export function getUsernameValidationMessage(username: string) {
  if (username.length < USERNAME_MIN_LENGTH) {
    return 'Usernames must be at least 3 characters.';
  }

  if (!USERNAME_PATTERN.test(username)) {
    return 'Use lowercase letters, numbers, periods, or underscores only.';
  }

  return null;
}

export async function claimUsername({
  userSub,
  username,
  displayName,
  email,
}: {
  userSub: string;
  username: string;
  displayName?: string | null;
  email?: string | null;
}) {
  const normalizedUsername = normalizeUsernameInput(username);

  if (!isValidUsername(normalizedUsername)) {
    throw new Error(getUsernameValidationMessage(normalizedUsername) ?? 'Invalid username.');
  }

  const userId = formatUserId(userSub);
  const profilePath = getUserProfilePath(userSub);
  const usernamePath = `usernames/${normalizedUsername}`;
  const profileRef = ref(db, profilePath);
  const usernameRef = ref(db, usernamePath);

  const [profileSnapshot, usernameSnapshot] = await Promise.all([
    get(profileRef),
    get(usernameRef),
  ]);

  const existingOwner = usernameSnapshot.exists()
    ? String(usernameSnapshot.val())
    : null;

  if (existingOwner && existingOwner !== userId) {
    throw new Error('That username is already taken.');
  }

  const existingProfile = profileSnapshot.exists()
    ? (profileSnapshot.val() as Partial<AppUserProfile>)
    : null;
  const previousUsername = existingProfile?.username ?? null;
  const now = new Date().toISOString();

  await Promise.all([
    set(profileRef, {
      username: normalizedUsername,
      displayName: displayName?.trim() || normalizedUsername,
      email: email ?? null,
      createdAt: existingProfile?.createdAt ?? now,
      updatedAt: now,
    } satisfies AppUserProfile),
    set(usernameRef, userId),
    previousUsername && previousUsername !== normalizedUsername
      ? remove(ref(db, `usernames/${previousUsername}`))
      : Promise.resolve(),
  ]);

  return normalizedUsername;
}
