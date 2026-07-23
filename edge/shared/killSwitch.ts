// The per-endpoint kill-switch. An operator flips one flag (a Worker env var, no
// deploy) and the endpoint returns a typed 503; the client renders "cloud
// features paused" and stays fully deterministic. Scoped per endpoint so pausing
// one endpoint never touches the others — each passes its own flag.

/** True when a flag pauses its endpoint. Any value but ''/'off'/unset pauses. */
export function isPaused(flag: string | undefined): boolean {
  return flag !== undefined && flag !== '' && flag !== 'off'
}

/** True when the synthesis endpoint is paused. Any value but 'off'/unset pauses. */
export function isSynthesisPaused(flag: string | undefined): boolean {
  return isPaused(flag)
}
