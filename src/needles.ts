export declare class LoudnessMeter {
  constructor(options: LoudnessMeterOptions);
  on(event: 'dataavailable', listener: (event: LoudnessMeterEvent) => void): void;
  off(event: 'dataavailable', listener: (event: LoudnessMeterEvent) => void): void;
  start(): void;
  dispose(): void;
}

export interface LoudnessMeterOptions {
  readonly source: AudioNode;
  readonly workerUri: string;
  readonly modes?: ReadonlyArray<'momentary' | 'short-term' | 'integrated'>;
}

export interface LoudnessMeterEvent {
  readonly data: LoudnessMeterData
}

export interface LoudnessMeterData {
  readonly mode: 'momentary' | 'short-term' | 'integrated';
  readonly value: number;
}
