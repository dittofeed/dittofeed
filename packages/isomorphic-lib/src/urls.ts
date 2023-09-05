export function hasProtocol(inputURL: string): boolean {
  return !inputURL.match(/^[a-zA-Z]+:\/\//);
}
