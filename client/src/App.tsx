import React, { useEffect, useRef, useState } from 'react';
import {
  Background,
  Title,
  App as AppComponent,
  Container,
  MediaButton,
  MediaContainer,
  MediaInfoBox,
  SongTitle,
  SongArtist,
  SongDetails,
  VolumeSlider,
  VolumeBox,
  Subtitle,
  DataContainer,
  Spacer,
  TextContainer,
  GetInTouch,
  DataChild,
} from './App.styled';
import {
  PlayArrowOutlined,
  PauseOutlined,
  VolumeDownOutlined,
  VolumeOffOutlined,
  HeadphonesOutlined,
  LibraryMusicOutlined,
} from '@mui/icons-material';
import { io, Socket } from 'socket.io-client';
import axios from 'axios';

export const App = (): JSX.Element => {
  const [socket, setSocket] = useState<Socket>();
  const [tracks, setTracks] = useState(0);
  const [playing, setPlaying] = useState<boolean>(false);
  const [streamUrl, setStreamUrl] = useState<string>(process.env.REACT_APP_STREAM_URL || '');
  const [volume, setVolume] = useState<number>(parseFloat(localStorage.getItem('volume') || '0.15'));
  const playerRef = useRef<HTMLAudioElement>(null);
  const [listeners, setListeners] = useState(0);
  const [currentlyPlaying, setCurrentlyPlaying] = useState({
    artist: '',
    title: '',
  });

  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.volume = volume;
      if (!playerRef.current.canPlayType || playerRef.current.canPlayType('audio/ogg') === '') {
        setStreamUrl(process.env.REACT_APP_BACKUP_STREAM_URL || '');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerRef]);

  useEffect(() => {
    const getTrackCount = async (): Promise<void> => {
      const url = `${process.env.REACT_APP_API_URL}/trackcount`;
      const { data } = await axios.get<number>(url);
      setTracks(data);
    };
    getTrackCount();
  }, []);

  useEffect(() => {
    const socket = io(process.env.REACT_APP_SOCKET_IO_CONNECTION || '', {
      reconnectionDelayMax: 10000,
      reconnection: true,
      reconnectionAttempts: 10,
      path: '/socket',
    });
    setSocket(socket);
    socket.on('connect', () => {
      socket.emit('LISTEN_STATE_CHANGED', playing);
    });
    socket.on('LISTENER_COUNT', (data) => {
      setListeners(data);
    });
    socket.on('TRACK_CHANGED', ({ artist, title }: { artist: string; title: string }) => {
      if (artist === '' || title === '') return; //dont set empty tracks
      setCurrentlyPlaying({
        artist,
        title,
      });
      if (navigator.mediaSession) {
        navigator.mediaSession.metadata = new MediaMetadata({
          artist,
          title,
          album: process.env.REACT_APP_WEB_HEADER,
          artwork: [
            {
              src: '/artwork.png',
              type: 'image/png',
              sizes: '236x236',
            },
          ],
        });
      }
    });
    return () => {
      socket.off('LISTENER_COUNT');
      socket.off('TRACK_CHANGED');
      socket.disconnect();
      setSocket(undefined);
    };
  }, []);

  const handleMediaButtonClick = async (): Promise<void> => {
    if (!playerRef.current) return;
    if (playing) {
      playerRef.current.pause();
      playerRef.current.src = ''; //prevent actual pausing or it starts to desync
    } else {
      playerRef.current.src = streamUrl;
      playerRef.current.play();
    }
    if (socket) {
      socket.emit('LISTEN_STATE_CHANGED', !playing);
    }
    setPlaying(!playing);
  };

  const handleVolumeChanged = (newVolume: number): void => {
    localStorage.setItem('volume', newVolume.toString());
    setVolume(newVolume);
    if (playerRef.current) {
      playerRef.current.volume = newVolume;
    }
  };

  const handleAudioError = (): void => {
    if (playerRef.current && playing) {
      playerRef.current.src = '';
      playerRef.current.src = streamUrl;
      playerRef.current.play();
    }
  };

  return (
    <AppComponent>
      <audio ref={playerRef} onError={handleAudioError} />
      <Background autoPlay muted loop src="bg.mp4" />
      <Container>
        <TextContainer>
          <Title>{process.env.REACT_APP_WEB_HEADER}</Title>
          <Subtitle>{process.env.REACT_APP_WEB_SUBTITLE}</Subtitle>
        </TextContainer>
        <MediaContainer>
          <MediaButton onClick={handleMediaButtonClick}>
            {playing ? <PauseOutlined /> : <PlayArrowOutlined />}
          </MediaButton>
          <MediaInfoBox>
            <SongDetails>
              <SongTitle replaceSpeed={50}>{currentlyPlaying.title}</SongTitle>
              <SongArtist replaceSpeed={50}>{currentlyPlaying.artist}</SongArtist>
            </SongDetails>
            <VolumeBox>
              {volume === 0 ? <VolumeOffOutlined /> : <VolumeDownOutlined />}
              <VolumeSlider
                value={volume}
                min={0}
                max={0.3}
                step={0.01}
                onChange={(_event, value): void => handleVolumeChanged(value as number)}
              />
            </VolumeBox>
          </MediaInfoBox>
          <DataContainer>
            <DataChild flex="initial" title={`${listeners} listening now!`}>
              <HeadphonesOutlined /> {listeners}
            </DataChild>
            <Spacer>/ /</Spacer>
            <DataChild title={`${tracks} tracks loaded!`}>
              <LibraryMusicOutlined />
              {tracks}
            </DataChild>
            <Spacer>/ /</Spacer>
            <DataChild flex={0.5} title={`Version ${process.env.REACT_APP_VERSION}`}>
              {process.env.REACT_APP_VERSION}
            </DataChild>
          </DataContainer>
        </MediaContainer>
      </Container>
      {process.env.REACT_APP_CONTACT && <GetInTouch>{process.env.REACT_APP_CONTACT}</GetInTouch>}
    </AppComponent>
  );
};
