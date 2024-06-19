import { AppDataFiles, TrackEventProperties } from "../types";

interface TrackEventForFiles {
  files: AppDataFiles;
  properties: TrackEventProperties;
}

export async function persistFiles(
  _events: TrackEventForFiles[],
): Promise<TrackEventProperties[]> {
  return [];
}
