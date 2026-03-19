import {
  Room,
  RoomEvent,
  Track,
  RemoteTrack,
  RemoteTrackPublication,
  RemoteParticipant,
  ConnectionState,
  DataPacket_Kind,
} from 'livekit-client';

export const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || 'ws://localhost:7880';

export interface SessionEvent {
  type:
    | 'AVATAR_SPEAKING'
    | 'AVATAR_IDLE'
    | 'TRANSCRIPT_INTERIM'
    | 'TRANSCRIPT_FINAL'
    | 'SESSION_WARNING'
    | 'SESSION_END'
    | 'GUARDRAIL_TRIGGERED';
  text?: string;
  message?: string;
  reason?: string;
}

export interface LiveKitSessionOptions {
  url: string;
  token: string;
  onVideoTrack?: (track: MediaStreamTrack | null) => void;
  onAudioTrack?: (track: MediaStreamTrack | null) => void;
  onSessionEvent?: (event: SessionEvent) => void;
  onConnectionStateChange?: (state: ConnectionState) => void;
}

export async function connectToSession(options: LiveKitSessionOptions): Promise<Room> {
  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
  });

  // Handle remote tracks (avatar's video/audio)
  room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) => {
    if (track.kind === Track.Kind.Video && options.onVideoTrack) {
      const mediaTrack = track.mediaStreamTrack;
      options.onVideoTrack(mediaTrack);
    }
    if (track.kind === Track.Kind.Audio && options.onAudioTrack) {
      const mediaTrack = track.mediaStreamTrack;
      options.onAudioTrack(mediaTrack);
      // Auto-play audio
      const audio = new Audio();
      audio.srcObject = new MediaStream([mediaTrack]);
      audio.play().catch(() => { /* autoplay policy */ });
    }
  });

  room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
    if (track.kind === Track.Kind.Video && options.onVideoTrack) {
      options.onVideoTrack(null);
    }
    if (track.kind === Track.Kind.Audio && options.onAudioTrack) {
      options.onAudioTrack(null);
    }
  });

  // Handle data channel messages (session events from bot)
  room.on(RoomEvent.DataReceived, (payload: Uint8Array, participant?: RemoteParticipant, kind?: DataPacket_Kind) => {
    try {
      const decoder = new TextDecoder();
      const event: SessionEvent = JSON.parse(decoder.decode(payload));
      options.onSessionEvent?.(event);
    } catch {
      // Ignore malformed data
    }
  });

  // Connection state changes
  room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
    options.onConnectionStateChange?.(state);
  });

  // Connect to the room
  await room.connect(options.url, options.token);

  // Publish local microphone
  await room.localParticipant.setMicrophoneEnabled(true);

  return room;
}

export async function toggleMicrophone(room: Room, enabled: boolean): Promise<void> {
  await room.localParticipant.setMicrophoneEnabled(enabled);
}

export function disconnectFromSession(room: Room): void {
  room.disconnect();
}
