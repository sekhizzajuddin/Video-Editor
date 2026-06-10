import { useState, useEffect } from "react";

export const BREAKPOINTS = {
  mobile: 640,
  tablet: 1024,
  desktop: 1280,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

function getBreakpoint(width: number): Breakpoint {
  if (width < BREAKPOINTS.mobile) return "mobile";
  if (width < BREAKPOINTS.tablet) return "tablet";
  if (width < BREAKPOINTS.desktop) return "desktop";
  return "desktop";
}

export function useBreakpoint(): {
  breakpoint: Breakpoint;
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isBelow: (bp: Breakpoint) => boolean;
} {
  const [size, setSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  useEffect(() => {
    const onResize = () => {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const bp = getBreakpoint(size.width);
  return {
    breakpoint: bp,
    width: size.width,
    height: size.height,
    isMobile: bp === "mobile",
    isTablet: bp === "tablet",
    isBelow: (target: Breakpoint) => size.width < BREAKPOINTS[target],
  };
}
