export interface AppUserProfile {
  username: string;
  displayName: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
}

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 20;
const USERNAME_PATTERN = /^[a-z0-9_]+$/;

export function normalizeUsernameInput(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
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
    return 'Use lowercase letters, numbers, or underscores only.';
  }

  return null;
}

export { USERNAME_MIN_LENGTH, USERNAME_MAX_LENGTH };
