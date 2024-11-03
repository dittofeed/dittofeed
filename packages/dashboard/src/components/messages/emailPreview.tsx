export default function EmailPreview({ body }: { body: string }) {
  return (
    <iframe
      srcDoc={`<!DOCTYPE html>${body}`}
      title="email-body-preview"
      style={{
        border: "none",
        height: "100%",
        width: "100%",
      }}
    />
  );
}
