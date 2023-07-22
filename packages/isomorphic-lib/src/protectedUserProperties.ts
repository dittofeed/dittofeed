const protectedUserProperties = new Set<string>(["id", "anonymousId"]);
// FIXME add second protected category, for user properties that can be edited but not deleted
export default protectedUserProperties;
