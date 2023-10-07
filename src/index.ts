import { LoudnessMeter } from './needles.js';

const context = new AudioContext();
const bufferPromise = load('music.mp4');
const displays = {
  momentary: document.getElementById('momentary'),
  'short-term': document.getElementById('short_term'),
  integrated: document.getElementById('integrated')
} as const

async function load(url: string): Promise<AudioBuffer> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  return await context.decodeAudioData(arrayBuffer);
}

async function start(): Promise<void> {
  await context.resume();
  const source = context.createBufferSource();
  source.connect(context.destination);
  const meter = new LoudnessMeter({
    source,
    modes: ['momentary', 'short-term', 'integrated'],
    workerUri: 'needles-worker.js'
  })
  meter.on('dataavailable', (event) => {
    displays[event.data.mode].textContent = String(event.data.value).slice(0, 5);
  })
  source.buffer = await bufferPromise;
  meter.start();
  source.start();
}

// start()
window.addEventListener('click', start, { once: true });
