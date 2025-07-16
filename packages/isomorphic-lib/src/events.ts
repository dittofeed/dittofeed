export function doesEventNameMatch({
  pattern,
  event,
}: {
  pattern: string;
  event: string;
}): boolean {
  if (pattern.endsWith("*")) {
    return event.startsWith(pattern.slice(0, -1));
  }
  return pattern === event;
}
