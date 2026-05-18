import { SpeedRampPoint } from '../types';

export function getSpeedAtTime(speedRampPoints: SpeedRampPoint[] | undefined, time: number): number {
  if (!speedRampPoints || speedRampPoints.length === 0) return 1;

  const sorted = [...speedRampPoints].sort((a, b) => a.time - b.time);

  if (time <= sorted[0].time) return sorted[0].speed;
  if (time >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].speed;

  for (let i = 0; i < sorted.length - 1; i++) {
    if (time >= sorted[i].time && time <= sorted[i + 1].time) {
      const t = (time - sorted[i].time) / (sorted[i + 1].time - sorted[i].time);
      return sorted[i].speed + (sorted[i + 1].speed - sorted[i].speed) * t;
    }
  }

  return 1;
}
