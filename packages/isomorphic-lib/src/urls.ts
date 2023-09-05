export function hasProtocol(inputURL: string): boolean {
  return Boolean(inputURL.match(/^[a-zA-Z]+:\/\//));
}
