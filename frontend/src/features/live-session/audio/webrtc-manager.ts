/**
 * WebRtcManager handles audio tracks, WebRTC peer connection,
 * remote caller track ingestion, and track replacement during handoff.
 */
export class WebRtcManager {
  private localStream: MediaStream | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private remoteStream: MediaStream | null = null;
  private onRemoteStreamCallback?: (stream: MediaStream) => void;

  constructor(private readonly iceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]) {}

  async startLocalMic(): Promise<MediaStream> {
    if (this.localStream) {
      return this.localStream;
    }

    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    return this.localStream;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  setOnRemoteStream(callback: (stream: MediaStream) => void): void {
    this.onRemoteStreamCallback = callback;
  }

  initPeerConnection(): RTCPeerConnection {
    this.peerConnection = new RTCPeerConnection({ iceServers: this.iceServers });

    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        this.peerConnection.addTrack(track, this.localStream);
      }
    }

    this.peerConnection.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteStream) {
        this.remoteStream = remoteStream;
        this.onRemoteStreamCallback?.(remoteStream);
      }
    };

    return this.peerConnection;
  }

  /**
   * Mutes or un-mutes the local physical microphone track.
   * Ensures room sounds never leak to the caller while AI is active.
   */
  setLocalMicMuted(muted: boolean): void {
    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        track.enabled = !muted;
      }
    }
  }

  /**
   * Switches outgoing WebRTC audio from human microphone to the AI synthetic stream.
   * Automatically disables the local microphone track for privacy.
   */
  async switchToAiTrack(aiTrack: MediaStreamTrack | null): Promise<void> {
    this.setLocalMicMuted(true);
    await this.replaceOutgoingTrack(aiTrack);
  }

  /**
   * Switches outgoing WebRTC audio back to the human microphone track.
   */
  async switchToHumanMic(): Promise<void> {
    this.setLocalMicMuted(false);
    const micTrack = this.localStream?.getAudioTracks()[0] ?? null;
    await this.replaceOutgoingTrack(micTrack);
  }

  /**
   * Replaces the currently transmitted audio track on the peer connection.
   * Useful for handoff: switching from human microphone to AI synthetic audio.
   */
  async replaceOutgoingTrack(newTrack: MediaStreamTrack | null): Promise<void> {
    if (!this.peerConnection) return;

    const sender = this.peerConnection
      .getSenders()
      .find((s) => s.track?.kind === 'audio');

    if (sender) {
      await sender.replaceTrack(newTrack);
    }
  }

  /**
   * Creates a simulated caller loopback audio stream for single-device hackathon testing.
   */
  createSimulatedCallerStream(): MediaStream {
    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const destination = audioContext.createMediaStreamDestination();
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.frequency.value = 300;
    gain.gain.value = 0.05; // soft tone

    osc.connect(gain);
    gain.connect(destination);
    osc.start();

    this.remoteStream = destination.stream;
    return destination.stream;
  }

  stop(): void {
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        track.stop();
      }
      this.localStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.remoteStream = null;
  }
}
