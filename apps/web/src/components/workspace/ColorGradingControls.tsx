import React from "react";
import { useAdvancedTimelineStore } from "../../stores/advanced-timeline-store";

export const ColorGradingControls: React.FC = () => {
  const { trackControls } = useAdvancedTimelineStore();
  const controls = Object.values(trackControls);

  return (
    <div className="w-full h-full p-4 bg-bg-1 text-fg overflow-auto">
      <h3 className="text-sm font-semibold mb-3 text-fg">Color Grading</h3>

      {/* Color Wheels placeholder - full implementation would have real wheels */}
      <div className="space-y-4">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-fg-3 font-medium mb-1.5 block">Shadows</label>
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-gray-800 to-gray-900 border border-border/50 relative">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white/30" />
          </div>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-fg-3 font-medium mb-1.5 block">Midtones</label>
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-gray-600 to-gray-700 border border-border/50 relative">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white/30" />
          </div>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-fg-3 font-medium mb-1.5 block">Highlights</label>
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 border border-border/50 relative">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white/30" />
          </div>
        </div>
      </div>

      {/* Simplified sliders */}
      <div className="mt-6 space-y-3">
        <div>
          <label className="text-[10px] text-fg-3 flex justify-between">
            <span>Luminance</span>
            <span className="tabular-nums">0</span>
          </label>
          <div className="h-1.5 bg-border rounded-full mt-1 relative">
            <div className="absolute top-0 left-1/2 w-2 h-2 -ml-1 -mt-0.5 rounded-full bg-accent cursor-pointer" />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-fg-3 flex justify-between">
            <span>Saturation</span>
            <span className="tabular-nums">100%</span>
          </label>
          <div className="h-1.5 bg-border rounded-full mt-1 relative">
            <div className="absolute top-0 left-full w-2 h-2 -ml-1 -mt-0.5 rounded-full bg-accent cursor-pointer" />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-fg-3 flex justify-between">
            <span>Contrast</span>
            <span className="tabular-nums">100%</span>
          </label>
          <div className="h-1.5 bg-border rounded-full mt-1 relative">
            <div className="absolute top-0 left-1/2 w-2 h-2 -ml-1 -mt-0.5 rounded-full bg-accent cursor-pointer" />
          </div>
        </div>
      </div>

      {/* Summary stats */}
      {controls.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border/50 text-[10px] text-fg-3">
          <p>{controls.length} tracks available for color grading</p>
        </div>
      )}
    </div>
  );
};
