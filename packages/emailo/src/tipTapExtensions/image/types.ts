export interface ImageOptions {
  url: string;
  alt: string;
  width: number;
}

export type ImageAttributes = ImageOptions & {
  defaultOpen: boolean;
};
