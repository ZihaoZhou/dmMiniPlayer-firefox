class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

export default globalThis.ResizeObserver ?? NoopResizeObserver
