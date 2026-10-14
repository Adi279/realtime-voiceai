import { useEffect, useRef, useState } from 'react';
import { PipecatClient } from '@pipecat-ai/client-js';
import { SmallWebRTCTransport } from '@pipecat-ai/small-webrtc-transport';

export default function App() {
  const clientRef = useRef(null);
  const audioRef = useRef(null);
  const scrollRef = useRef(null);
  const [status, setStatus] = useState('Ready to connect');
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => () => {
    try { clientRef.current?.disconnect(); } catch { /* already disconnected */ }
  }, []);

  const addTranscript = (role, data) => {
    const text = typeof data === 'string' ? data : data?.text;
    if (!text?.trim()) return;
    // Pipecat may send interim and final transcripts. Keep interim text out of
    // the permanent chat log to avoid duplicate bubbles.
    if (data && typeof data === 'object' && data.final === false) return;
    setMessages((old) => [...old, {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      role,
      text: text.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }]);
  };

  const connect = async () => {
    setError('');
    setStatus('Connecting…');
    try {
      const transport = new SmallWebRTCTransport();
      const client = new PipecatClient({
        transport,
        enableMic: true,
        enableCam: false,
        callbacks: {
          onConnected: () => { setConnected(true); setStatus('Connected · Speak naturally'); },
          onDisconnected: () => {
            setConnected(false);
            setStatus('Disconnected');
            if (audioRef.current) {
              audioRef.current.pause();
              audioRef.current.srcObject = null;
            }
          },
          onUserTranscript: (data) => addTranscript('user', data),
          onBotTranscript: (data) => addTranscript('assistant', data),
          onTrackStarted: (track) => {
            if (track.kind !== 'audio' || !audioRef.current) return;
            audioRef.current.srcObject = new MediaStream([track]);
            audioRef.current.play().catch((err) => {
              console.error('Bot audio playback failed:', err);
              setError(`Could not play bot audio: ${err?.message || 'Check your browser sound settings and try reconnecting.'}`);
            });
          },
          onError: (err) => { setError(err?.message || 'A voice connection error occurred.'); },
        },
      });
      clientRef.current = client;
      await client.connect({
  connection_url: '/api/offer',
});
      setConnected(true);
      setStatus('Connected · Speak naturally');
    } catch (err) {
      console.error(err);
      setConnected(false);
      setStatus('Connection failed');
      setError(err?.message || 'Could not connect. Check the backend and API keys.');
      try { clientRef.current?.disconnect(); } catch { /* ignore */ }
      clientRef.current = null;
    }
  };

  const disconnect = async () => {
    try { await clientRef.current?.disconnect(); } catch (err) { console.warn(err); }
    clientRef.current = null;
    setConnected(false);
    setStatus('Disconnected');
  };

  return (
    <main className="page-shell">
      <section className="chat-card">
        <header className="topbar">
          <div className="brand-mark" aria-hidden="true">✦</div>
          <div className="brand-copy">
            <h1>Voice AI</h1>
            <p>Real-time conversation</p>
          </div>
          <div className={`connection-pill ${connected ? 'online' : ''}`}>
            <span className="status-dot" />{status}
          </div>
        </header>

        <section className="conversation" ref={scrollRef} aria-live="polite">
          {messages.length === 0 ? (
            <div className="empty-state">
              <div className="orb"><span>✦</span></div>
              <h2>Let’s talk.</h2>
              <p>Connect, allow microphone access, and start speaking. Your words and the AI’s replies will appear here.</p>
              <div className="hint-row"><span>🎙</span> Hands-free voice conversation</div>
              <div className="hint-row"><span>💬</span> Live transcript in this chat</div>
            </div>
          ) : (
            <div className="message-list">
              {messages.map((message) => (
                <article key={message.id} className={`message-row ${message.role === 'user' ? 'from-user' : 'from-ai'}`}>
                  <div className="avatar">{message.role === 'user' ? 'You' : 'AI'}</div>
                  <div className="bubble-wrap">
                    <div className="sender-label">{message.role === 'user' ? 'You' : 'Voice AI'} <time>{message.time}</time></div>
                    <div className="bubble">{message.text}</div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {error && <div className="error-banner" role="alert">{error}</div>}
        <audio ref={audioRef} autoPlay playsInline aria-hidden="true" />

        <footer className="controls">
          <div className={`audio-wave ${connected ? 'active' : ''}`} aria-hidden="true">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <i key={n} style={{ '--n': n }} />)}
          </div>
          {connected ? (
            <button className="connect-button stop-button" onClick={disconnect}><span>■</span> End conversation</button>
          ) : (
            <button className="connect-button" onClick={connect}><span>🎙</span> Start conversation</button>
          )}
        </footer>
      </section>
      <p className="page-footnote">Powered by Pipecat · Deepgram · Groq · Cartesia</p>
    </main>
  );
}
