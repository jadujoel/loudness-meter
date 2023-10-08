import { LoudnessMeter } from './meter';

const context = new AudioContext();
const bufferPromise = load('music.mp4');
const displays = {
  momentary: document.getElementById('momentary'),
  short_term: document.getElementById('short_term'),
  integrated: document.getElementById('integrated')
} as const

const buttons = {
  start_song: document.getElementById('start_song') as HTMLButtonElement,
  connect_mic: document.getElementById('connect_mic') as HTMLButtonElement,
  disconnect_mic: document.getElementById('disconnect_mic') as HTMLButtonElement,
} as const

buttons.start_song.addEventListener('click', startSong);
buttons.connect_mic.addEventListener('click', connect_mic);
buttons.disconnect_mic.addEventListener('click', disconnect_mic)

async function load (url: string): Promise<AudioBuffer> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  return await context.decodeAudioData(arrayBuffer);
}

async function startSong (): Promise<void> {
  await context.resume();
  const source = context.createBufferSource();
  source.connect(context.destination);
  const meter = new LoudnessMeter({
    source,
    modes: ['momentary', 'short_term', 'integrated'],
    workletUri: 'meter-worklet.js',
    // workerUri: 'meter-worker.js',
  })
  meter.on('dataavailable', (event) => {
    displays[event.data.mode].textContent = String(event.data.value).slice(0, 5);
  })
  source.buffer = await bufferPromise;
  meter.start();
  source.start();
}

let mic: MediaStreamAudioSourceNode;
let meter: LoudnessMeter;
async function connect_mic (): Promise<void> {
  await context.resume();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mic = context.createMediaStreamSource(stream);
  meter?.off();
  meter?.stop();
  meter = new LoudnessMeter({
    source: mic,
    modes: ['momentary', 'short_term', 'integrated'],
    workerUri: 'meter-worker.js',

  })
  meter.on('dataavailable', (event) => {
    displays[event.data.mode].textContent = String(event.data.value).slice(0, 5);
  })
  meter.start();
}

function disconnect_mic (): void {
  mic?.disconnect();

}
