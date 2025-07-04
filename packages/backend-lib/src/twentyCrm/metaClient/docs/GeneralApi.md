# GeneralApi

All URIs are relative to *http://localhost:3000/rest/metadata*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**getOpenApiSchema**](#getopenapischema) | **GET** /open-api/metadata | Get Open Api Schema|

# **getOpenApiSchema**
> GetOpenApiSchema200Response getOpenApiSchema()


### Example

```typescript
import {
    GeneralApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new GeneralApi(configuration);

const { status, data } = await apiInstance.getOpenApiSchema();
```

### Parameters
This endpoint does not have any parameters.


### Return type

**GetOpenApiSchema200Response**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Successful operation |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

