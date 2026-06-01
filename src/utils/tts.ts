export function generateTTSAudio(
  _text: string,
  _voiceName: string,
  rate: number,
  _pitch: number
): Promise<Blob> {
  const sampleRate = 16000;
  const duration = Math.max(0.5, _text.length * 0.08 / (rate || 1));
  const length = Math.ceil(duration * sampleRate);
  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, buffer.byteLength - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, length * 2, true);

  for (let i = 0; i < length; i++) {
    view.setInt16(44 + i * 2, 0, true);
  }

  return Promise.resolve(new Blob([buffer], { type: 'audio/wav' }));
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
