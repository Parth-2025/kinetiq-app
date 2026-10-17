import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Asset } from "expo-asset";
import type { HeroVideoHandle, HeroVideoProps } from "./hero-video.types";

// The browser element keeps play() in the button gesture when autoplay is blocked.
// Native platforms use Expo Video through the sibling implementation.
export const HeroVideo = forwardRef<HeroVideoHandle, HeroVideoProps>(
  function HeroVideo({ source, poster, active, onPlayingChange }, ref) {
    const element = useRef<HTMLVideoElement>(null);
    const [failed, setFailed] = useState(false);
    const [hasPlayed, setHasPlayed] = useState(false);
    const onState = useRef(onPlayingChange);
    onState.current = onPlayingChange;
    const play = useCallback(() => {
      const video = element.current;
      if (!video) return;
      video.muted = true;
      void video.play().catch(() => onState.current(false));
    }, []);
    const pause = useCallback(() => element.current?.pause(), []);
    useImperativeHandle(ref, () => ({ play, pause }), [play, pause]);
    useEffect(() => {
      if (active) play();
      else pause();
    }, [active, play, pause]);
    const posterUri = Asset.fromModule(poster).uri;
    return (
      <>
        <video
          ref={element}
          src={Asset.fromModule(source).uri}
          poster={posterUri}
          muted
          loop
          playsInline
          preload="metadata"
          controls={false}
          disablePictureInPicture
          tabIndex={-1}
          aria-hidden="true"
          onPlaying={() => {
            setHasPlayed(true);
            setFailed(false);
            onState.current(true);
          }}
          onPause={() => onState.current(false)}
          onError={() => {
            setFailed(true);
            onState.current(false);
          }}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "fill",
            pointerEvents: "none",
          }}
        />
        {(!hasPlayed || failed) && (
          <img
            src={posterUri}
            alt=""
            aria-hidden="true"
            draggable={false}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "fill",
              pointerEvents: "none",
            }}
          />
        )}
      </>
    );
  },
);
