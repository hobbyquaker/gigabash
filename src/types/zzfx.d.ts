declare module 'zzfx' {
  export const ZZFX: {
    audioContext: AudioContext;
    sampleRate: number;
    buildSamples(...params: (number | undefined)[]): number[];
  };
}
