# PersonApi

All URIs are relative to *http://localhost:3000/rest*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**personCreatedPost**](#personcreatedpost) | **POST** /Person Created | |
|[**personDeletedPost**](#persondeletedpost) | **POST** /Person Deleted | |
|[**personUpdatedPost**](#personupdatedpost) | **POST** /Person Updated | |

# **personCreatedPost**
> personCreatedPost()


### Example

```typescript
import {
    PersonApi,
    Configuration,
    PersonCreatedPostRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new PersonApi(configuration);

let xTwentyWebhookSignature: string; //HMAC SHA256 signature of the request payload using the webhook secret. To compute the signature: 1. Concatenate `X-Twenty-Webhook-Timestamp`, a colon (:), and the JSON string of the request payload. 2. Compute the HMAC SHA256 hash using the shared secret as the key. 3. Send the resulting hex digest as this header value. Example (Node.js): ```javascript const crypto = require(\"crypto\"); const timestamp = \"1735066639761\"; const payload = JSON.stringify({...}); const secret = \"your-secret\"; const stringToSign = `${timestamp}:${JSON.stringify(payload)}`; const signature = crypto.createHmac(\"sha256\", secret)   .update(stringToSign)   .digest(\"hex\"); ``` (optional) (default to undefined)
let xTwentyWebhookTimestamp: string; //Unix timestamp of when the webhook was sent. This timestamp is included in the HMAC signature generation to prevent replay attacks. (optional) (default to undefined)
let xTwentyWebhookNonce: string; //Unique identifier for this webhook request to prevent replay attacks. Consumers should ensure this nonce is not reused. (optional) (default to undefined)
let personCreatedPostRequest: PersonCreatedPostRequest; // (optional)

const { status, data } = await apiInstance.personCreatedPost(
    xTwentyWebhookSignature,
    xTwentyWebhookTimestamp,
    xTwentyWebhookNonce,
    personCreatedPostRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **personCreatedPostRequest** | **PersonCreatedPostRequest**|  | |
| **xTwentyWebhookSignature** | [**string**] | HMAC SHA256 signature of the request payload using the webhook secret. To compute the signature: 1. Concatenate &#x60;X-Twenty-Webhook-Timestamp&#x60;, a colon (:), and the JSON string of the request payload. 2. Compute the HMAC SHA256 hash using the shared secret as the key. 3. Send the resulting hex digest as this header value. Example (Node.js): &#x60;&#x60;&#x60;javascript const crypto &#x3D; require(\&quot;crypto\&quot;); const timestamp &#x3D; \&quot;1735066639761\&quot;; const payload &#x3D; JSON.stringify({...}); const secret &#x3D; \&quot;your-secret\&quot;; const stringToSign &#x3D; &#x60;${timestamp}:${JSON.stringify(payload)}&#x60;; const signature &#x3D; crypto.createHmac(\&quot;sha256\&quot;, secret)   .update(stringToSign)   .digest(\&quot;hex\&quot;); &#x60;&#x60;&#x60; | (optional) defaults to undefined|
| **xTwentyWebhookTimestamp** | [**string**] | Unix timestamp of when the webhook was sent. This timestamp is included in the HMAC signature generation to prevent replay attacks. | (optional) defaults to undefined|
| **xTwentyWebhookNonce** | [**string**] | Unique identifier for this webhook request to prevent replay attacks. Consumers should ensure this nonce is not reused. | (optional) defaults to undefined|


### Return type

void (empty response body)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: Not defined


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Return a 200 status to indicate that the data was received successfully |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **personDeletedPost**
> personDeletedPost()


### Example

```typescript
import {
    PersonApi,
    Configuration,
    PersonDeletedPostRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new PersonApi(configuration);

let xTwentyWebhookSignature: string; //HMAC SHA256 signature of the request payload using the webhook secret. To compute the signature: 1. Concatenate `X-Twenty-Webhook-Timestamp`, a colon (:), and the JSON string of the request payload. 2. Compute the HMAC SHA256 hash using the shared secret as the key. 3. Send the resulting hex digest as this header value. Example (Node.js): ```javascript const crypto = require(\"crypto\"); const timestamp = \"1735066639761\"; const payload = JSON.stringify({...}); const secret = \"your-secret\"; const stringToSign = `${timestamp}:${JSON.stringify(payload)}`; const signature = crypto.createHmac(\"sha256\", secret)   .update(stringToSign)   .digest(\"hex\"); ``` (optional) (default to undefined)
let xTwentyWebhookTimestamp: string; //Unix timestamp of when the webhook was sent. This timestamp is included in the HMAC signature generation to prevent replay attacks. (optional) (default to undefined)
let xTwentyWebhookNonce: string; //Unique identifier for this webhook request to prevent replay attacks. Consumers should ensure this nonce is not reused. (optional) (default to undefined)
let personDeletedPostRequest: PersonDeletedPostRequest; // (optional)

const { status, data } = await apiInstance.personDeletedPost(
    xTwentyWebhookSignature,
    xTwentyWebhookTimestamp,
    xTwentyWebhookNonce,
    personDeletedPostRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **personDeletedPostRequest** | **PersonDeletedPostRequest**|  | |
| **xTwentyWebhookSignature** | [**string**] | HMAC SHA256 signature of the request payload using the webhook secret. To compute the signature: 1. Concatenate &#x60;X-Twenty-Webhook-Timestamp&#x60;, a colon (:), and the JSON string of the request payload. 2. Compute the HMAC SHA256 hash using the shared secret as the key. 3. Send the resulting hex digest as this header value. Example (Node.js): &#x60;&#x60;&#x60;javascript const crypto &#x3D; require(\&quot;crypto\&quot;); const timestamp &#x3D; \&quot;1735066639761\&quot;; const payload &#x3D; JSON.stringify({...}); const secret &#x3D; \&quot;your-secret\&quot;; const stringToSign &#x3D; &#x60;${timestamp}:${JSON.stringify(payload)}&#x60;; const signature &#x3D; crypto.createHmac(\&quot;sha256\&quot;, secret)   .update(stringToSign)   .digest(\&quot;hex\&quot;); &#x60;&#x60;&#x60; | (optional) defaults to undefined|
| **xTwentyWebhookTimestamp** | [**string**] | Unix timestamp of when the webhook was sent. This timestamp is included in the HMAC signature generation to prevent replay attacks. | (optional) defaults to undefined|
| **xTwentyWebhookNonce** | [**string**] | Unique identifier for this webhook request to prevent replay attacks. Consumers should ensure this nonce is not reused. | (optional) defaults to undefined|


### Return type

void (empty response body)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: Not defined


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Return a 200 status to indicate that the data was received successfully |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **personUpdatedPost**
> personUpdatedPost()


### Example

```typescript
import {
    PersonApi,
    Configuration,
    PersonUpdatedPostRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new PersonApi(configuration);

let xTwentyWebhookSignature: string; //HMAC SHA256 signature of the request payload using the webhook secret. To compute the signature: 1. Concatenate `X-Twenty-Webhook-Timestamp`, a colon (:), and the JSON string of the request payload. 2. Compute the HMAC SHA256 hash using the shared secret as the key. 3. Send the resulting hex digest as this header value. Example (Node.js): ```javascript const crypto = require(\"crypto\"); const timestamp = \"1735066639761\"; const payload = JSON.stringify({...}); const secret = \"your-secret\"; const stringToSign = `${timestamp}:${JSON.stringify(payload)}`; const signature = crypto.createHmac(\"sha256\", secret)   .update(stringToSign)   .digest(\"hex\"); ``` (optional) (default to undefined)
let xTwentyWebhookTimestamp: string; //Unix timestamp of when the webhook was sent. This timestamp is included in the HMAC signature generation to prevent replay attacks. (optional) (default to undefined)
let xTwentyWebhookNonce: string; //Unique identifier for this webhook request to prevent replay attacks. Consumers should ensure this nonce is not reused. (optional) (default to undefined)
let personUpdatedPostRequest: PersonUpdatedPostRequest; // (optional)

const { status, data } = await apiInstance.personUpdatedPost(
    xTwentyWebhookSignature,
    xTwentyWebhookTimestamp,
    xTwentyWebhookNonce,
    personUpdatedPostRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **personUpdatedPostRequest** | **PersonUpdatedPostRequest**|  | |
| **xTwentyWebhookSignature** | [**string**] | HMAC SHA256 signature of the request payload using the webhook secret. To compute the signature: 1. Concatenate &#x60;X-Twenty-Webhook-Timestamp&#x60;, a colon (:), and the JSON string of the request payload. 2. Compute the HMAC SHA256 hash using the shared secret as the key. 3. Send the resulting hex digest as this header value. Example (Node.js): &#x60;&#x60;&#x60;javascript const crypto &#x3D; require(\&quot;crypto\&quot;); const timestamp &#x3D; \&quot;1735066639761\&quot;; const payload &#x3D; JSON.stringify({...}); const secret &#x3D; \&quot;your-secret\&quot;; const stringToSign &#x3D; &#x60;${timestamp}:${JSON.stringify(payload)}&#x60;; const signature &#x3D; crypto.createHmac(\&quot;sha256\&quot;, secret)   .update(stringToSign)   .digest(\&quot;hex\&quot;); &#x60;&#x60;&#x60; | (optional) defaults to undefined|
| **xTwentyWebhookTimestamp** | [**string**] | Unix timestamp of when the webhook was sent. This timestamp is included in the HMAC signature generation to prevent replay attacks. | (optional) defaults to undefined|
| **xTwentyWebhookNonce** | [**string**] | Unique identifier for this webhook request to prevent replay attacks. Consumers should ensure this nonce is not reused. | (optional) defaults to undefined|


### Return type

void (empty response body)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: Not defined


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Return a 200 status to indicate that the data was received successfully |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

