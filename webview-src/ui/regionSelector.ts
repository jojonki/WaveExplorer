export interface RegionEvent {
  startS: number;
  endS: number;
}

/**
 * Attach mouse drag listeners to a canvas for region selection.
 * Calls onRegion when a drag is completed or updated.
 * Calls onClear when the user clicks without dragging.
 */
export function attachRegionSelector(
  canvas: HTMLCanvasElement,
  getDuration: () => number,
  onRegion: (r: RegionEvent) => void,
  onClear: () => void,
  leftPad = 0,
  rightPad = 0
): () => void {
  let isDragging = false;
  let dragStartX = 0;

  function pixelToTime(x: number): number {
    const duration = getDuration();
    if (duration <= 0) { return 0; }
    const drawW = canvas.clientWidth - leftPad - rightPad;
    return Math.max(0, Math.min(1, (x - leftPad) / drawW)) * duration;
  }

  function onMouseDown(e: MouseEvent): void {
    if (e.button !== 0) { return; }
    isDragging = true;
    dragStartX = e.offsetX;
    e.preventDefault();
  }

  function onMouseMove(e: MouseEvent): void {
    if (!isDragging) { return; }
    const x0 = Math.min(dragStartX, e.offsetX);
    const x1 = Math.max(dragStartX, e.offsetX);
    if (Math.abs(x1 - x0) < 3) { return; }
    onRegion({
      startS: pixelToTime(x0),
      endS: pixelToTime(x1),
    });
  }

  function onMouseUp(e: MouseEvent): void {
    if (!isDragging) { return; }
    isDragging = false;
    const x0 = Math.min(dragStartX, e.offsetX);
    const x1 = Math.max(dragStartX, e.offsetX);
    if (Math.abs(x1 - x0) < 3) {
      onClear();
    } else {
      onRegion({
        startS: pixelToTime(x0),
        endS: pixelToTime(x1),
      });
    }
  }

  function onMouseLeave(): void {
    if (isDragging) {
      isDragging = false;
    }
  }

  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mouseleave', onMouseLeave);

  // Return cleanup function
  return () => {
    canvas.removeEventListener('mousedown', onMouseDown);
    canvas.removeEventListener('mousemove', onMouseMove);
    canvas.removeEventListener('mouseup', onMouseUp);
    canvas.removeEventListener('mouseleave', onMouseLeave);
  };
}
