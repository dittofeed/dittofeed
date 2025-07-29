- help me amend the /test endpoint in packages/api/src/controllers/contentController.ts so that it can take base64 encoded attachments in the passed user properties
- update the user property validation for file attachments

```typescript
// TODO: instead validate as AppDataFileInternal and then check if it's a blob storage file
// if it's a Base64EncodedFile
const file = schemaValidateWithErr(assignment, BlobStorageFile);
```

- write a test in packages/backend-lib/src/messaging.test.ts