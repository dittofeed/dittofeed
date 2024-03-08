enum PublisherStatusType {
  Unpublished = "Unpublished",
  OutOfDate = "OutOfDate",
  UpToDate = "UpToDate",
}

interface PublisherUnpublishedStatus {
  type: PublisherStatusType.Unpublished;
}

interface PublisherOutOfDateStatus {
  type: PublisherStatusType.OutOfDate;
}

interface PublisherUpToDateStatus {
  type: PublisherStatusType.UpToDate;
}

type PublisherStatus =
  | PublisherUnpublishedStatus
  | PublisherOutOfDateStatus
  | PublisherUpToDateStatus;

export function Publisher() {
  return (
    <div>
      <h1>Publisher</h1>
    </div>
  );
}
