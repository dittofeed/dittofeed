export interface MinimalJourney {
  name: string;
  id: string;
}

// Map<relatedResourceId, Map<journeyId, journeyName>>
export type MinimalJourneyMap = Map<string, Map<string, string>>;

export function getJourneysUsedBy(
  journeysUsedBy: MinimalJourneyMap,
  relatedId: string,
): MinimalJourney[] {
  const journeys = Array.from(journeysUsedBy.get(relatedId)?.entries() ?? []);
  return journeys.map(([id, name]) => ({ id, name }));
}
