export default function assertIsNode(e: EventTarget | null): e is Node {
  return !!e && "nodeType" in e;
}
