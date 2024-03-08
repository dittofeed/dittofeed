export enum PublisherStatusType {
  Unpublished = "Unpublished",
  OutOfDate = "OutOfDate",
  UpToDate = "UpToDate",
}

export interface PublisherUnpublishedStatus {
  type: PublisherStatusType.Unpublished;
}

export interface PublisherOutOfDateStatus {
  type: PublisherStatusType.OutOfDate;
}

export interface PublisherUpToDateStatus {
  type: PublisherStatusType.UpToDate;
}

export type PublisherStatus =
  | PublisherUnpublishedStatus
  | PublisherOutOfDateStatus
  | PublisherUpToDateStatus;

export interface PublisherProps {
  status: PublisherStatus;
  onPublish: () => void;
  onRevert: () => void;
}

export function Publisher(props: PublisherProps) {
  return (
    <div>
      <h1>Publisher</h1>
    </div>
  );
}

export type PublisherDraftToggleStatus =
  | PublisherUnpublishedStatus
  | (PublisherOutOfDateStatus & { isDraft: boolean; onToggle: () => void })
  | PublisherUpToDateStatus;

export interface PublisherDraftToggleProps {
  status: PublisherDraftToggleStatus;
}

export function PublisherDraftToggle(props: PublisherDraftToggleProps) {
  return (
    <div>
      <h1>PublisherDraftToggle</h1>
    </div>
  );
}
