# PersonUpdatedPostRequest


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**targetUrl** | **string** |  | [optional] [default to undefined]
**eventName** | **string** |  | [optional] [default to undefined]
**objectMetadata** | [**PersonCreatedPostRequestObjectMetadata**](PersonCreatedPostRequestObjectMetadata.md) |  | [optional] [default to undefined]
**workspaceId** | **string** |  | [optional] [default to undefined]
**webhookId** | **string** |  | [optional] [default to undefined]
**eventDate** | **string** |  | [optional] [default to undefined]
**record** | [**PersonForResponse**](PersonForResponse.md) |  | [optional] [default to undefined]
**updatedFields** | **Array&lt;string&gt;** |  | [optional] [default to undefined]

## Example

```typescript
import { PersonUpdatedPostRequest } from './api';

const instance: PersonUpdatedPostRequest = {
    targetUrl,
    eventName,
    objectMetadata,
    workspaceId,
    webhookId,
    eventDate,
    record,
    updatedFields,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
