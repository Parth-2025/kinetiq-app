export type HeroVideoHandle = { play: () => void; pause: () => void };
export type HeroVideoProps = {
  source: number;
  poster: number;
  active: boolean;
  onPlayingChange: (playing: boolean) => void;
};
