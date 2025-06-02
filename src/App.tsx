import { useState, useRef } from 'react'
import './App.css'

function App() {
  const [isRunning, setIsRunning] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const mediaSourceRef = useRef<MediaSource | null>(null)
  const sourceBufferRef = useRef<SourceBuffer | null>(null)

  const startAgent = async () => {
    if (isRunning) return
    setIsRunning(true)
    // Setup MediaSource and audio element
    const mediaSource = new MediaSource()
    mediaSourceRef.current = mediaSource
    let sourceBufferAdded = false
    mediaSource.addEventListener('sourceopen', () => {
      if (!sourceBufferAdded) {
        const sb = mediaSource.addSourceBuffer('audio/webm; codecs=opus')
        sourceBufferRef.current = sb
        sourceBufferAdded = true
      }
    })
    if (audioRef.current) {
      audioRef.current.src = URL.createObjectURL(mediaSource)
      audioRef.current.play()
    }

    const ws = new WebSocket('ws://localhost:8000/ws')
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    ws.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        console.log('Received text message:', event.data)
        return
      }
      let arrayBuffer: ArrayBuffer
      if (event.data instanceof ArrayBuffer) {
        arrayBuffer = event.data
      } else if (event.data instanceof Blob) {
        arrayBuffer = await event.data.arrayBuffer()
      } else {
        console.warn('Received non-binary data from websocket:', event.data)
        return
      }
      // Append to MediaSource for streaming playback
      const sb = sourceBufferRef.current
      if (sb && !sb.updating) {
        try {
          sb.appendBuffer(new Uint8Array(arrayBuffer))
        } catch (e) {
          console.error('Error appending buffer to SourceBuffer', e)
        }
      }
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mediaRecorder = new window.MediaRecorder(stream, { mimeType: 'audio/webm' })
    mediaRecorderRef.current = mediaRecorder
    audioChunksRef.current = []

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0 && wsRef.current?.readyState === 1) {
        wsRef.current.send(e.data)
      }
    }
    mediaRecorder.start(200) // send every 200ms
  }

  // Stop the agent: close websocket, stop recording
  const stopAgent = () => {
    setIsRunning(false)
    mediaRecorderRef.current?.stop()
    mediaRecorderRef.current = null
    wsRef.current?.close()
    wsRef.current = null
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
    }
    mediaSourceRef.current = null
    sourceBufferRef.current = null
  }

  return (
    <div className="voice-agent-container">
      <h1>Voice Agent</h1>
      <div style={{ marginBottom: 16 }}>
        <button onClick={startAgent} disabled={isRunning} style={{ marginRight: 8 }}>
          Start
        </button>
        <button onClick={stopAgent} disabled={!isRunning}>
          Stop
        </button>
      </div>
      <p>Status: {isRunning ? 'Running' : 'Stopped'}</p>
      <audio ref={audioRef} style={{ display: 'none' }} />
    </div>
  )
}

export default App
