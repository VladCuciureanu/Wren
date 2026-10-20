export type KeyAction = "quit" | "mute" | "volume_up" | "volume_down";

/**
 * Map a byte read from stdin in raw mode to an action. In raw mode the
 * terminal delivers Ctrl+C as byte 0x03 instead of raising SIGINT.
 */
export function keyAction(byte: number): KeyAction | undefined {
  switch (byte) {
    case 0x03:
    case 0x71: // q
      return "quit";
    case 0x6d: // m
      return "mute";
    case 0x2b: // +
    case 0x3d: // =
      return "volume_up";
    case 0x2d: // -
      return "volume_down";
    default:
      return undefined;
  }
}
