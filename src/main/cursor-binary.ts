let cursorBinary: string | null = null;

export function setCursorLaunchBinary(binary: string | null): void {
  cursorBinary = binary;
}

export function getCursorLaunchBinary(): string {
  return cursorBinary ?? 'cursor-agent';
}
