import { useEffect, useRef, useCallback } from "react";

interface SwipeConfig {
  /** Minimum horizontal distance to trigger swipe (px) */
  minDistance?: number;
  /** Maximum vertical deviation relative to horizontal (ratio) */
  maxVerticalRatio?: number;
  /** Minimum velocity to trigger swipe (px/ms) */
  minVelocity?: number;
}

const defaultConfig: Required<SwipeConfig> = {
  minDistance: 80,
  maxVerticalRatio: 0.33,
  minVelocity: 0.3,
};

export function useSwipeDrawer(
  isOpen: boolean,
  onOpen: () => void,
  onClose: () => void,
  config: SwipeConfig = {},
): void {
  const { minDistance, maxVerticalRatio, minVelocity } = {
    ...defaultConfig,
    ...config,
  };

  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    // Only track single finger touches
    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    touchStart.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
  }, []);

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (!touchStart.current) return;
      if (e.changedTouches.length !== 1) return;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStart.current.x;
      const deltaY = touch.clientY - touchStart.current.y;
      const deltaTime = Date.now() - touchStart.current.time;

      touchStart.current = null;

      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);

      // Check if it's a valid horizontal swipe
      if (absDeltaX < minDistance) return;
      if (absDeltaY > absDeltaX * maxVerticalRatio) return;

      const velocity = absDeltaX / deltaTime;
      if (velocity < minVelocity) return;

      // Right swipe to open, left swipe to close
      if (deltaX > 0 && !isOpen) {
        onOpen();
      } else if (deltaX < 0 && isOpen) {
        onClose();
      }
    },
    [isOpen, onOpen, onClose, minDistance, maxVerticalRatio, minVelocity],
  );

  useEffect(() => {
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchEnd]);
}
