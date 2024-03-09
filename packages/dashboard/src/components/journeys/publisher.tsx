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
  onPublish: () => void;
  onRevert: () => void;
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
}

export function Publisher({ status }: PublisherProps) {
  if (status.type === PublisherStatusType.Unpublished) {
    return <>Unpublished</>;
  }
  if (status.type === PublisherStatusType.UpToDate) {
    return <>UpToDate</>;
  }
  return (
    <>
      <p>OutOfDate</p>
      <button onClick={status.onPublish}>publish</button>
      <button onClick={status.onRevert}>revert</button>
    </>
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
