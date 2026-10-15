/**
 * WebRtcManager handles audio tracks, WebRTC peer connection,
 * remote caller track ingestion, and track replacement during handoff.
 */
export class WebRtcManager {
  private localStream: MediaStream | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private remoteStream: MediaStream | null = null;
  private remoteAudio: HTMLAudioElement | null = null;
  private onRemoteStreamCallback?: (stream: MediaStream) => void;
  private onIceCandidateCallback?: (candidate: RTCIceCandidateInit) => void;
  private pendingIceCandidates: RTCIceCandidateInit[] = [];

  constructor(private readonly iceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]) {}

  async startLocalMic(): Promise<MediaStream> {
    if (this.localStream) {
      return this.localStream;
    }

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
    } catch {
      // Fallback: create a silent dummy audio track so session and WebRTC can still function
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const dest = ctx.createMediaStreamDestination();
      this.localStream = dest.stream;
    }

    if (this.peerConnection && this.peerConnection.getSenders().length === 0) {
      for (const track of this.localStream.getAudioTracks()) {
        this.peerConnection.addTrack(track, this.localStream);
      }
    }

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

  setOnIceCandidate(callback: (candidate: RTCIceCandidateInit) => void): void {
    this.onIceCandidateCallback = callback;
  }

  initPeerConnection(): RTCPeerConnection {
    if (this.peerConnection) return this.peerConnection;
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
        if (!this.remoteAudio) {
          this.remoteAudio = new Audio();
          this.remoteAudio.autoplay = true;
          this.remoteAudio.setAttribute('playsinline', 'true');
        }
        this.remoteAudio.srcObject = remoteStream;
        void this.remoteAudio.play().catch(() => undefined);
        this.onRemoteStreamCallback?.(remoteStream);
      }
    };

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) this.onIceCandidateCallback?.(event.candidate.toJSON());
    };

    return this.peerConnection;
  }

  async createOffer(): Promise<string> {
    const peer = this.initPeerConnection();
    const offer = await peer.createOffer({ offerToReceiveAudio: true });
    await peer.setLocalDescription(offer);
    if (!offer.sdp) throw new Error('WEBRTC_OFFER_MISSING_SDP');
    return offer.sdp;
  }

  async acceptOffer(sdp: string): Promise<string> {
    const peer = this.initPeerConnection();
    await peer.setRemoteDescription({ type: 'offer', sdp });
    await this.flushPendingIceCandidates();
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    if (!answer.sdp) throw new Error('WEBRTC_ANSWER_MISSING_SDP');
    return answer.sdp;
  }

  async acceptAnswer(sdp: string): Promise<void> {
    const peer = this.initPeerConnection();
    await peer.setRemoteDescription({ type: 'answer', sdp });
    await this.flushPendingIceCandidates();
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    const peer = this.initPeerConnection();
    if (!peer.remoteDescription) {
      this.pendingIceCandidates.push(candidate);
      return;
    }
    await peer.addIceCandidate(candidate);
  }

  private async flushPendingIceCandidates(): Promise<void> {
    if (!this.peerConnection?.remoteDescription) return;
    const candidates = this.pendingIceCandidates.splice(0);
    for (const candidate of candidates) {
      await this.peerConnection.addIceCandidate(candidate);
    }
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
    this.pendingIceCandidates = [];
    if (this.remoteAudio) {
      this.remoteAudio.pause();
      this.remoteAudio.srcObject = null;
      this.remoteAudio = null;
    }
  }
}
