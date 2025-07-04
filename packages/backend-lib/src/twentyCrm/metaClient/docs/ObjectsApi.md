# ObjectsApi

All URIs are relative to *http://localhost:3000/rest/metadata*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**createOneObject**](#createoneobject) | **POST** /objects | Create One object|
|[**deleteOneObject**](#deleteoneobject) | **DELETE** /objects/{id} | Delete One object|
|[**objectsGet**](#objectsget) | **GET** /objects | Find Many objects|
|[**objectsIdGet**](#objectsidget) | **GET** /objects/{id} | Find One object|
|[**updateOneObject**](#updateoneobject) | **PATCH** /objects/{id} | Update One object|

# **createOneObject**
> CreateOneObject200Response createOneObject(modelObject)


### Example

```typescript
import {
    ObjectsApi,
    Configuration,
    ModelObject
} from './api';

const configuration = new Configuration();
const apiInstance = new ObjectsApi(configuration);

let modelObject: ModelObject; //body

const { status, data } = await apiInstance.createOneObject(
    modelObject
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **modelObject** | **ModelObject**| body | |


### Return type

**CreateOneObject200Response**

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

# **deleteOneObject**
> DeleteOneObject200Response deleteOneObject()


### Example

```typescript
import {
    ObjectsApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new ObjectsApi(configuration);

let id: string; //Object id. (default to undefined)

const { status, data } = await apiInstance.deleteOneObject(
    id
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**string**] | Object id. | defaults to undefined|


### Return type

**DeleteOneObject200Response**

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

# **objectsGet**
> ObjectsGet200Response objectsGet()


### Example

```typescript
import {
    ObjectsApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new ObjectsApi(configuration);

let limit: number; //Limits the number of objects returned. (optional) (default to 1000)
let startingAfter: string; //Returns objects starting after a specific cursor. You can find cursors in **startCursor** and **endCursor** in **pageInfo** in response data (optional) (default to undefined)
let endingBefore: string; //Returns objects ending before a specific cursor. You can find cursors in **startCursor** and **endCursor** in **pageInfo** in response data (optional) (default to undefined)

const { status, data } = await apiInstance.objectsGet(
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

**ObjectsGet200Response**

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

# **objectsIdGet**
> ObjectsIdGet200Response objectsIdGet()


### Example

```typescript
import {
    ObjectsApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new ObjectsApi(configuration);

let id: string; //Object id. (default to undefined)

const { status, data } = await apiInstance.objectsIdGet(
    id
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**string**] | Object id. | defaults to undefined|


### Return type

**ObjectsIdGet200Response**

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

# **updateOneObject**
> UpdateOneObject200Response updateOneObject(objectForUpdate)


### Example

```typescript
import {
    ObjectsApi,
    Configuration,
    ObjectForUpdate
} from './api';

const configuration = new Configuration();
const apiInstance = new ObjectsApi(configuration);

let id: string; //Object id. (default to undefined)
let objectForUpdate: ObjectForUpdate; //body

const { status, data } = await apiInstance.updateOneObject(
    id,
    objectForUpdate
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **objectForUpdate** | **ObjectForUpdate**| body | |
| **id** | [**string**] | Object id. | defaults to undefined|


### Return type

**UpdateOneObject200Response**

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

