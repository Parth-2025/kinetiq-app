/**
 * B1 removed Firebase. Leaderboard, friends, social inbox and profile
 * cosmetics return in sub-project B2. Until then any access throws.
 */
const message = "persistence for this feature returns in B2";

export const db = new Proxy(
  {},
  {
    get() {
      throw new Error(message);
    },
  },
) as unknown as never;
