/**
 * Vitest setup for extension tests
 *
 * Mocks canvas to prevent lottie-web initialization errors in jsdom environment.
 * lottie-web tries to call getContext('2d') on canvas elements during import,
 * which fails in jsdom since it doesn't support canvas rendering.
 */

// Mock canvas getContext before any imports that might load lottie-web
HTMLCanvasElement.prototype.getContext = ((contextId: string) => {
  if (contextId === '2d') {
    return {
      fillStyle: '',
      fillRect: () => {},
      clearRect: () => {},
      getImageData: () => ({ data: [] }),
      putImageData: () => {},
      createImageData: () => ({ data: [] }),
      setTransform: () => {},
      drawImage: () => {},
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      stroke: () => {},
      fill: () => {},
      translate: () => {},
      scale: () => {},
      rotate: () => {},
      arc: () => {},
      measureText: () => ({ width: 0 }),
      transform: () => {},
      rect: () => {},
      clip: () => {},
      createLinearGradient: () => ({
        addColorStop: () => {},
      }),
      createRadialGradient: () => ({
        addColorStop: () => {},
      }),
    } as unknown as CanvasRenderingContext2D;
  }
  return null;
}) as typeof HTMLCanvasElement.prototype.getContext;
