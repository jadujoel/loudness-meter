interface Coefficients {
  readonly numerators: readonly [number, number, number];
  readonly denominators: readonly [number, number, number];
}

function preFilterCoefficients (fs: number): Coefficients {
  const db = 3.999843853973347;
  const f0 = 1681.974450955533;
  const Q = 0.7071752369554196;
  const K = Math.tan(Math.PI * f0 / fs);

  const Vh = Math.pow(10, db / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);

  const denominator0 = 1 + K / Q + K * K;
  const denominator1 = 2 * (K * K - 1) / denominator0;
  const denominator2 = (1 - K / Q + K * K) / denominator0;
  const numerator0 = (Vh + Vb * K / Q + K * K) / denominator0;
  const numerator1 = 2 * (K * K - Vh) / denominator0;
  const numerator2 = (Vh - Vb * K / Q + K * K) / denominator0;

  return {
    numerators: [numerator0, numerator1, numerator2],
    denominators: [1, denominator1, denominator2]
  }
}

function weightingFilterCoefficients (fs: number): Coefficients {
  const f0 = 38.13547087602444;
  const Q = 0.5003270373238773;
  const K = Math.tan(Math.PI * f0 / fs);

  const denominator1 = 2 * (K * K - 1) / (1 + K / Q + K * K);
  const denominator2 = (1 - K / Q + K * K) / (1 + K / Q + K * K);
  const numerator0 = 1;
  const numerator1 = -2;
  const numerator2 = 1;

  return {
    numerators: [numerator0, numerator1, numerator2],
    denominators: [1, denominator1, denominator2]
  }
}

function preFilter (context: BaseAudioContext):  IIRFilterNode {
  const coefficients = preFilterCoefficients(context.sampleRate);
  return context.createIIRFilter(
    coefficients.numerators,
    coefficients.denominators
  )
}

function weightingFilter(context: BaseAudioContext) {
  const coefficients = weightingFilterCoefficients(context.sampleRate);
  return context.createIIRFilter(
    coefficients.numerators,
    coefficients.denominators
  )
}

// type MeterTypes = 'momentary' | 'short_term' | 'integrated';
type MeterListener = (params: MeterListenerParameters) => void
interface MeterListenerParameters {
  readonly type: LoudnessMeterEventType
  readonly data: LoudnessMeterData
}

class LoudnessMeterObservable {
  _listeners: Record<LoudnessMeterEventType, MeterListener[]> = {
    dataavailable: [],
    start: [],
    pause: [],
    resume: [],
    stop: [],
  };
  on (type: LoudnessMeterEventType, listener: MeterListener): void {
    this._listeners[type].push(listener);
  }

  off (type?: LoudnessMeterEventType, listener?: MeterListener): void {
    if (!type) {
      this._listeners = {
        dataavailable: [],
        start: [],
        pause: [],
        resume: [],
        stop: [],
      };
    }
    if (listener) {
      this._listeners[type] = this._listeners[type].filter(l => l !== listener);
    } else {
      this._listeners[type] = [];
    }
  }

  trigger (type: LoudnessMeterEventType, data: LoudnessMeterData): void {
    this._listeners[type].forEach(listener => {
      listener({ type, data });
    });
  }
}

/**
 * Wrapper around the AudioWorkletNode.
 * Sets up the worker and the node to provide a standard interface for
 * processing audio.
 */
class AudioWorkletAdapter {
  readonly source: StartableNode;
  readonly context: BaseAudioContext | OfflineAudioContext;
  _node?: Promise<AudioWorkletNode>;
  constructor (controller: LoudnessController, public readonly name: string, public readonly uri: string) {
    this.source = controller.source;
    this.context = this.source.context;
    this.node.then(node => {
      (node.port as unknown as { onmessage: Function }).onmessage = (event) => {
        // console.debug("EVENT", event, "TYPE", event.data.type, "DATA", event.data)
        controller.trigger(event.data.type, event.data);
      }
    });
  }

  get node (): Promise<AudioWorkletNode> {
    if (this._node) {
      return this._node
    }
    this._node = new Promise((resolve, reject) => {
      return this.context.audioWorklet.addModule(this.uri).then(() => {
        return resolve(new AudioWorkletNode(this.context, this.name))
      }).catch(reject)
    });

    return this._node
  }

  message (data) {
    this.node.then((node) => node.port.postMessage(data));
  }
}

/**
 * Wrapper around the ScriptProcessorNode.
 * Sets up the worker and the node to provide a standard interface for
 * processing audio.
 */
class ScriptProcessorAdapter {
  readonly source: StartableNode;
  readonly context: BaseAudioContext | OfflineAudioContext;
  readonly worker: Worker;
  _node?: Promise<ScriptProcessorNode>;

  constructor (controller: LoudnessController, path: string) {
    this.source = controller.source;
    this.context = this.source.context;
    this.worker = new Worker(path);

    this.node.then((node) => {
      node.onaudioprocess = (event) => {
        const channels = [];
        for (var i = 0; i < this.source.channelCount; i++) {
          channels[i] = event.inputBuffer.getChannelData(i);
        }
        this.worker.postMessage({ type: 'process', input: channels });
      };
    });

    this.worker.onmessage = (event) => {
      controller.trigger(event.data.type, event.data);
    };
  }

  get node (): Promise<ScriptProcessorNode> {
    if (this._node) {
      return this._node
    }
    this._node = new Promise((resolve, reject) => {
      resolve(this.context.createScriptProcessor(1024, this.source.channelCount, this.source.channelCount));
    });

    return this._node
  }

  message (data: any, options?: StructuredSerializeOptions): void {
    this.worker.postMessage(data, options);
  }
}

/**
 * Adapter for offline analysis.
 * No need to set up scriptProcessorNode or audioWorkletNode. Audio data is
 * already decoded and can just be passed to the worker. `node` is just a
 * placeholder gain node for adapter API parity.
 */
class OfflineAdapter {
  readonly source: StartableNode;
  readonly context: BaseAudioContext | OfflineAudioContext;
  readonly worker: Worker;
  _node?: Promise<GainNode>;
  constructor (controller: LoudnessController, path: string) {
    this.source = controller.source;
    this.context = this.source.context;
    this.worker = new Worker(path);
    this.worker.onmessage = (event) => {
      controller.trigger(event.data.type, event.data);
    };
  }

  message (data: any) {
    this.worker.postMessage(data);
  }

  get node (): Promise<GainNode> {
    if (this._node) return this._node
    this._node = new Promise((resolve, reject) => {
      resolve(this.context.createGain());
    });
    return this._node
  }
}

interface WorkerAdapterOptions {
  readonly context: BaseAudioContext | OfflineAudioContext;
  readonly source: IIRFilterNode;
  readonly controller: LoudnessController;
}

type Adapter = OfflineAdapter | AudioWorkletAdapter | ScriptProcessorAdapter;

type MeterNode = AudioWorkletNode | ScriptProcessorNode | GainNode

/**
 * Factory which returns either an OfflineAdapter, AudioWorkletAdapter, or
 * ScriptProcessorAdapter, depending on browser support / mode.
 */
function WorkerAdapter ({context, source, controller}: WorkerAdapterOptions): Adapter {
  const adapter = _adapter(controller);
  adapter.node.then((node: MeterNode) => {
    node.connect(context.destination);
    source.connect(node);
  });

  return adapter
}

function _adapter (controller: LoudnessController): Adapter {
  if (controller.isOffline) {
    console.debug('Using OfflineAdapter');
    return new OfflineAdapter(controller, controller.workerUri)
  }
  if (controller.workletUri !== undefined) {
    console.debug('Using AudioWorkletAdapter');
    return new AudioWorkletAdapter(controller, 'meter-worklet', controller.workletUri)
  } else if (controller.workerUri !== undefined) {
    console.debug('Using ScriptProcessorAdapter');
    return new ScriptProcessorAdapter(controller, controller.workerUri)
  } else {
    throw new Error('Must provide either workerUri or workletUri')
  }
}

class InvalidStateError extends Error {
  constructor (message: string) {
    super(message);
    this.name = 'InvalidStateError';
  }
}

interface LoudnessControllerOptions extends LoudnessMeterOptions {
  readonly weightedSource: IIRFilterNode;
}

type LoudnessControllerState = 'inactive' | 'recording' | 'paused';
type LoudnessControllerAction = 'start' | 'pause' | 'resume' | 'stop';

class LoudnessController extends LoudnessMeterObservable {
  state: LoudnessControllerState;
  readonly workerUri?: string;
  readonly workletUri?: string;
  readonly source: StartableNode;
  readonly weightedSource: IIRFilterNode;
  readonly context: BaseAudioContext | OfflineAudioContext;
  _workerAdapter?: Adapter;

  constructor (options: LoudnessControllerOptions) {
    super();
    this.state = 'inactive';
    this.workerUri = options.workerUri;
    this.workletUri = options.workletUri;
    this.source = options.source;
    this.weightedSource = options.weightedSource;
    this.context = this.source.context;

    this.workerAdapter.message({
      type: 'initialize',
      attributes: {
        sampleRate: this.context.sampleRate,
        modes: options.modes
      },
    });
  }

  get workerAdapter () {
    return this._workerAdapter = this._workerAdapter || WorkerAdapter({
      controller: this,
      context: this.context,
      source: this.weightedSource
    })
  }

  get isOffline (): boolean {
    return isOffline(this.context)
  }

  input (buffer: AudioBuffer): void {
    const chunkLength = 16384;
    const audioBufferLength = buffer.length;
    const channelLength = buffer.numberOfChannels;

    if (this.isOffline) {
      this.workerAdapter.message({
        type: 'set',
        key: 'duration',
        value: buffer.duration * 1000
      });
    }

    // Refactor to support Safari (where copyFromChannel is unsupported)
    for (let i = 0; i < audioBufferLength; i += chunkLength) {
      const block = [];
      for (var channel = 0; channel < channelLength; channel++) {
        block[channel] = new Float32Array(chunkLength);
        buffer.copyFromChannel(block[channel], channel, i);
      }
      this.workerAdapter.message({ type: 'process', input: block });
    }
  }

  start (): void {
    if (this.state !== 'inactive') {
      this._throwInvalidStateErrorFor('start');
    }
    this.state = 'recording';
    this.workerAdapter.message({ type: 'record' });

    if (this.isOffline) {
      this.source.start();
      this._startRendering().then(renderedBuffer => this.input(renderedBuffer));
    }
  }

  pause (): void {
    if (this.state === 'inactive') {
      this._throwInvalidStateErrorFor('pause');
    }
    this.state = 'paused';
    this.workerAdapter.message({ type: 'pause' });
  }

  resume (): void {
    if (this.state === 'inactive') {
      this._throwInvalidStateErrorFor('resume');
    }
    this.state = 'recording';
    this.workerAdapter.message({ type: 'resume' });
  }

  stop (): void {
    if (this.state === 'inactive') {
      this._throwInvalidStateErrorFor('stop');
    }
    this.state = 'inactive';
    this.workerAdapter.message({ type: 'stop' });
  }

  reset (): void {
    this.workerAdapter.message({ type: 'reset' });
  }

  _startRendering (): Promise<AudioBuffer> {
    const context = this.context;
    if (isOffline(context)) {
      return new Promise(resolve => {
        context.startRendering();
        context.addEventListener('complete', (event) => {
          resolve(event.renderedBuffer);
        });
      })
    }
    throw new Error('Cannot start rendering in online mode')
  }

  _throwInvalidStateErrorFor (action: LoudnessControllerAction) {
    throw new InvalidStateError(`Failed to execute '${action}' on 'Needles': The Needles's state is '${this.state}'.`)
  }
}

function isOffline(context: BaseAudioContext | OfflineAudioContext): context is OfflineAudioContext {
  return context instanceof OfflineAudioContext
}

export class LoudnessMeter extends LoudnessController {
  constructor(options: LoudnessMeterOptions) {
    const context = options.source.context;
    const filter1 = preFilter(context);
    const filter2 = weightingFilter(context);
    options.source.connect(filter1);
    filter1.connect(filter2);
    super({ ...options, weightedSource: filter2 })
  }
}

type StartableNode = AudioNode & { readonly start: (when?: number) => void };

export interface LoudnessMeterOptions {
  readonly source: StartableNode;
  readonly modes: ReadonlyArray<'momentary' | 'short_term' | 'integrated'>;
  readonly workerUri?: string;
  readonly workletUri?: string;
}

export interface LoudnessMeterEvent {
  readonly data: LoudnessMeterData
  readonly type: LoudnessMeterEventType
}

export interface LoudnessMeterData {
  readonly type: LoudnessMeterEventType
  readonly mode: 'momentary' | 'short_term' | 'integrated';
  readonly value: number;
}

type LoudnessMeterEventType = 'dataavailable' | LoudnessControllerAction;
