const protectedUserProperties = new Set<string>([
  "id",
  "phone",
  "email",
  "anonymousId",
  "language",
  "deviceToken",
]);
export default protectedUserProperties;
