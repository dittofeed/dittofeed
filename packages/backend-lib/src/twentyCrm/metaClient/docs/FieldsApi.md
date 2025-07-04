# FieldsApi

All URIs are relative to *http://localhost:3000/rest/metadata*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**createOneField**](#createonefield) | **POST** /fields | Create One field|
|[**deleteOneField**](#deleteonefield) | **DELETE** /fields/{id} | Delete One field|
|[**fieldsGet**](#fieldsget) | **GET** /fields | Find Many fields|
|[**fieldsIdGet**](#fieldsidget) | **GET** /fields/{id} | Find One field|
|[**updateOneField**](#updateonefield) | **PATCH** /fields/{id} | Update One field|

# **createOneField**
> CreateOneField200Response createOneField(field)


### Example

```typescript
import {
    FieldsApi,
    Configuration,
    Field
} from './api';

const configuration = new Configuration();
const apiInstance = new FieldsApi(configuration);

let field: Field; //body

const { status, data } = await apiInstance.createOneField(
    field
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **field** | **Field**| body | |


### Return type

**CreateOneField200Response**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Successful operation |  -  |
|**400** | Bad Request |  -  |
|**401** | Unauthorized |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **deleteOneField**
> DeleteOneField200Response deleteOneField()


### Example

```typescript
import {
    FieldsApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new FieldsApi(configuration);

let id: string; //Object id. (default to undefined)

const { status, data } = await apiInstance.deleteOneField(
    id
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**string**] | Object id. | defaults to undefined|


### Return type

**DeleteOneField200Response**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Successful operation |  -  |
|**400** | Bad Request |  -  |
|**401** | Unauthorized |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **fieldsGet**
> FieldsGet200Response fieldsGet()


### Example

```typescript
import {
    FieldsApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new FieldsApi(configuration);

let limit: number; //Limits the number of objects returned. (optional) (default to 1000)
let startingAfter: string; //Returns objects starting after a specific cursor. You can find cursors in **startCursor** and **endCursor** in **pageInfo** in response data (optional) (default to undefined)
let endingBefore: string; //Returns objects ending before a specific cursor. You can find cursors in **startCursor** and **endCursor** in **pageInfo** in response data (optional) (default to undefined)

const { status, data } = await apiInstance.fieldsGet(
    limit,
    startingAfter,
    endingBefore
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **limit** | [**number**] | Limits the number of objects returned. | (optional) defaults to 1000|
| **startingAfter** | [**string**] | Returns objects starting after a specific cursor. You can find cursors in **startCursor** and **endCursor** in **pageInfo** in response data | (optional) defaults to undefined|
| **endingBefore** | [**string**] | Returns objects ending before a specific cursor. You can find cursors in **startCursor** and **endCursor** in **pageInfo** in response data | (optional) defaults to undefined|


### Return type

**FieldsGet200Response**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Successful operation |  -  |
|**400** | Bad Request |  -  |
|**401** | Unauthorized |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **fieldsIdGet**
> FieldsIdGet200Response fieldsIdGet()


### Example

```typescript
import {
    FieldsApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new FieldsApi(configuration);

let id: string; //Object id. (default to undefined)

const { status, data } = await apiInstance.fieldsIdGet(
    id
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**string**] | Object id. | defaults to undefined|


### Return type

**FieldsIdGet200Response**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Successful operation |  -  |
|**400** | Bad Request |  -  |
|**401** | Unauthorized |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **updateOneField**
> UpdateOneField200Response updateOneField(fieldForUpdate)


### Example

```typescript
import {
    FieldsApi,
    Configuration,
    FieldForUpdate
} from './api';

const configuration = new Configuration();
const apiInstance = new FieldsApi(configuration);

let id: string; //Object id. (default to undefined)
let fieldForUpdate: FieldForUpdate; //body

const { status, data } = await apiInstance.updateOneField(
    id,
    fieldForUpdate
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **fieldForUpdate** | **FieldForUpdate**| body | |
| **id** | [**string**] | Object id. | defaults to undefined|


### Return type

**UpdateOneField200Response**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Successful operation |  -  |
|**400** | Bad Request |  -  |
|**401** | Unauthorized |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

