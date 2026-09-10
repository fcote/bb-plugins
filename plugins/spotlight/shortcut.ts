export function isSpotlightShortcut(event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'isComposing'>, platform: string) {
  const mac = /Mac|iPhone|iPad|iPod/i.test(platform);
  return !event.isComposing && event.key.toLowerCase() === 'k' && !event.altKey && !event.shiftKey
    && (mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey);
}
