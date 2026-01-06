import { ParsedUrlQuery } from "querystring";

// Query param names
export const RETURN_PATH_PARAM = "returnPath";
export const RETURN_LABEL_PARAM = "returnLabel";

export interface ReturnNavigationParams {
  returnPath: string;
  returnLabel: string;
}

/**
 * Parse return navigation params from URL query
 */
export function parseReturnNavigation(
  query: ParsedUrlQuery,
): ReturnNavigationParams | null {
  const returnPath = query[RETURN_PATH_PARAM];
  const returnLabel = query[RETURN_LABEL_PARAM];

  if (typeof returnPath === "string" && typeof returnLabel === "string") {
    return {
      returnPath: decodeURIComponent(returnPath),
      returnLabel: decodeURIComponent(returnLabel),
    };
  }
  return null;
}

/**
 * Build a resource URL with return navigation params appended
 */
export function buildResourceUrlWithReturn(
  baseUrl: string,
  returnPath: string,
  returnLabel: string,
): string {
  const separator = baseUrl.includes("?") ? "&" : "?";
  const encodedPath = encodeURIComponent(returnPath);
  const encodedLabel = encodeURIComponent(returnLabel);
  return `${baseUrl}${separator}${RETURN_PATH_PARAM}=${encodedPath}&${RETURN_LABEL_PARAM}=${encodedLabel}`;
}
