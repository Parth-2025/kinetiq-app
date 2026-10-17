import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { useEventListener } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import type { HeroVideoHandle, HeroVideoProps } from "./hero-video.types";

export const HeroVideo = forwardRef<HeroVideoHandle, HeroVideoProps>(
  function HeroVideo({ source, poster, active, onPlayingChange }, ref) {
    const [firstFrame, setFirstFrame] = useState(false);
    const [hasPlayed, setHasPlayed] = useState(false);
    const [failed, setFailed] = useState(false);
    const player = useVideoPlayer(source, (video) => {
      video.loop = true;
      video.muted = true;
      video.volume = 0;
      video.audioMixingMode = "mixWithOthers";
      video.staysActiveInBackground = false;
      video.showNowPlayingNotification = false;
    });
    useEventListener(player, "playingChange", ({ isPlaying }) => {
      if (isPlaying) setHasPlayed(true);
      onPlayingChange(isPlaying);
    });
    useEventListener(player, "statusChange", ({ status }) => {
      setFailed(status === "error");
      if (status === "error") onPlayingChange(false);
    });
    const play = useCallback(() => {
      player.muted = true;
      player.play();
    }, [player]);
    const pause = useCallback(() => player.pause(), [player]);
    useImperativeHandle(ref, () => ({ play, pause }), [play, pause]);
    useEffect(() => {
      if (active) play();
      else pause();
    }, [active, play, pause]);
    return (
      <View
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="fill"
          nativeControls={false}
          allowsFullscreen={false}
          allowsPictureInPicture={false}
          allowsVideoFrameAnalysis={false}
          surfaceType="textureView"
          onFirstFrameRender={() => setFirstFrame(true)}
        />
        {(!firstFrame || !hasPlayed || failed) && (
          <Image
            source={poster}
            style={StyleSheet.absoluteFill}
            contentFit="fill"
            transition={0}
          />
        )}
      </View>
    );
  },
);
