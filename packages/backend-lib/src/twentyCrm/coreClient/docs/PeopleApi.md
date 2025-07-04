# PeopleApi

All URIs are relative to *http://localhost:3000/rest*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**createManyPeople**](#createmanypeople) | **POST** /batch/people | Create Many people|
|[**createOnePerson**](#createoneperson) | **POST** /people | Create One person|
|[**deleteOnePerson**](#deleteoneperson) | **DELETE** /people/{id} | Delete One person|
|[**findManyPeople**](#findmanypeople) | **GET** /people | Find Many people|
|[**findOnePerson**](#findoneperson) | **GET** /people/{id} | Find One person|
|[**findPersonDuplicates**](#findpersonduplicates) | **POST** /people/duplicates | Find person Duplicates|
|[**updateOnePerson**](#updateoneperson) | **PATCH** /people/{id} | Update One person|

# **createManyPeople**
> CreateManyPeople201Response createManyPeople(person)


### Example

```typescript
import {
    PeopleApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new PeopleApi(configuration);

let person: Array<Person>; //
let depth: 0 | 1 | 2; //Determines the level of nested related objects to include in the response.       - 0: Returns only the primary object\'s information.       - 1: Returns the primary object along with its directly related objects (with no additional nesting for related objects).       - 2: Returns the primary object, its directly related objects, and the related objects of those related objects. (optional) (default to 1)

const { status, data } = await apiInstance.createManyPeople(
    person,
    depth
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **person** | **Array<Person>**|  | |
| **depth** | [**0 | 1 | 2**]**Array<0 &#124; 1 &#124; 2>** | Determines the level of nested related objects to include in the response.       - 0: Returns only the primary object\&#39;s information.       - 1: Returns the primary object along with its directly related objects (with no additional nesting for related objects).       - 2: Returns the primary object, its directly related objects, and the related objects of those related objects. | (optional) defaults to 1|


### Return type

**CreateManyPeople201Response**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**201** | Successful operation |  -  |
|**400** | Bad Request |  -  |
|**401** | Unauthorized |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **createOnePerson**
> CreateOnePerson201Response createOnePerson(person)


### Example

```typescript
import {
    PeopleApi,
    Configuration,
    Person
} from './api';

const configuration = new Configuration();
const apiInstance = new PeopleApi(configuration);

let person: Person; //body
let depth: 0 | 1 | 2; //Determines the level of nested related objects to include in the response.       - 0: Returns only the primary object\'s information.       - 1: Returns the primary object along with its directly related objects (with no additional nesting for related objects).       - 2: Returns the primary object, its directly related objects, and the related objects of those related objects. (optional) (default to 1)

const { status, data } = await apiInstance.createOnePerson(
    person,
    depth
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **person** | **Person**| body | |
| **depth** | [**0 | 1 | 2**]**Array<0 &#124; 1 &#124; 2>** | Determines the level of nested related objects to include in the response.       - 0: Returns only the primary object\&#39;s information.       - 1: Returns the primary object along with its directly related objects (with no additional nesting for related objects).       - 2: Returns the primary object, its directly related objects, and the related objects of those related objects. | (optional) defaults to 1|


### Return type

**CreateOnePerson201Response**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**201** | Successful operation |  -  |
|**400** | Bad Request |  -  |
|**401** | Unauthorized |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **deleteOnePerson**
> DeleteOnePerson200Response deleteOnePerson()


### Example

```typescript
import {
    PeopleApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new PeopleApi(configuration);

let id: string; //Object id. (default to undefined)

const { status, data } = await apiInstance.deleteOnePerson(
    id
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**string**] | Object id. | defaults to undefined|


### Return type

**DeleteOnePerson200Response**

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

# **findManyPeople**
> FindManyPeople200Response findManyPeople()

**order_by**, **filter**, **limit**, **depth**, **starting_after** or **ending_before** can be provided to request your **people**

### Example

```typescript
import {
    PeopleApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new PeopleApi(configuration);

let orderBy: string; //Sorts objects returned.       Should have the following shape: **field_name_1,field_name_2[DIRECTION_2],...**       Available directions are **AscNullsFirst**, **AscNullsLast**, **DescNullsFirst**, **DescNullsLast**.       Default direction is **AscNullsFirst** (optional) (default to undefined)
let filter: string; //Filters objects returned.       Should have the following shape: **field_1[COMPARATOR]:value_1,field_2[COMPARATOR]:value_2...     To filter on composite type fields use **field.subField[COMPARATOR]:value_1     **     Available comparators are **eq**, **neq**, **in**, **containsAny**, **is**, **gt**, **gte**, **lt**, **lte**, **startsWith**, **like**, **ilike**.       You can create more complex filters using conjunctions **or**, **and**, **not**.       Default root conjunction is **and**.       To filter **null** values use **field[is]:NULL** or **field[is]:NOT_NULL**       To filter using **boolean** values use **field[eq]:true** or **field[eq]:false** (optional) (default to undefined)
let limit: number; //Limits the number of objects returned. (optional) (default to 60)
let depth: 0 | 1 | 2; //Determines the level of nested related objects to include in the response.       - 0: Returns only the primary object\'s information.       - 1: Returns the primary object along with its directly related objects (with no additional nesting for related objects).       - 2: Returns the primary object, its directly related objects, and the related objects of those related objects. (optional) (default to 1)
let startingAfter: string; //Returns objects starting after a specific cursor. You can find cursors in **startCursor** and **endCursor** in **pageInfo** in response data (optional) (default to undefined)
let endingBefore: string; //Returns objects ending before a specific cursor. You can find cursors in **startCursor** and **endCursor** in **pageInfo** in response data (optional) (default to undefined)

const { status, data } = await apiInstance.findManyPeople(
    orderBy,
    filter,
    limit,
    depth,
    startingAfter,
    endingBefore
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **orderBy** | [**string**] | Sorts objects returned.       Should have the following shape: **field_name_1,field_name_2[DIRECTION_2],...**       Available directions are **AscNullsFirst**, **AscNullsLast**, **DescNullsFirst**, **DescNullsLast**.       Default direction is **AscNullsFirst** | (optional) defaults to undefined|
| **filter** | [**string**] | Filters objects returned.       Should have the following shape: **field_1[COMPARATOR]:value_1,field_2[COMPARATOR]:value_2...     To filter on composite type fields use **field.subField[COMPARATOR]:value_1     **     Available comparators are **eq**, **neq**, **in**, **containsAny**, **is**, **gt**, **gte**, **lt**, **lte**, **startsWith**, **like**, **ilike**.       You can create more complex filters using conjunctions **or**, **and**, **not**.       Default root conjunction is **and**.       To filter **null** values use **field[is]:NULL** or **field[is]:NOT_NULL**       To filter using **boolean** values use **field[eq]:true** or **field[eq]:false** | (optional) defaults to undefined|
| **limit** | [**number**] | Limits the number of objects returned. | (optional) defaults to 60|
| **depth** | [**0 | 1 | 2**]**Array<0 &#124; 1 &#124; 2>** | Determines the level of nested related objects to include in the response.       - 0: Returns only the primary object\&#39;s information.       - 1: Returns the primary object along with its directly related objects (with no additional nesting for related objects).       - 2: Returns the primary object, its directly related objects, and the related objects of those related objects. | (optional) defaults to 1|
| **startingAfter** | [**string**] | Returns objects starting after a specific cursor. You can find cursors in **startCursor** and **endCursor** in **pageInfo** in response data | (optional) defaults to undefined|
| **endingBefore** | [**string**] | Returns objects ending before a specific cursor. You can find cursors in **startCursor** and **endCursor** in **pageInfo** in response data | (optional) defaults to undefined|


### Return type

**FindManyPeople200Response**

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

# **findOnePerson**
> FindOnePerson200Response findOnePerson()

**depth** can be provided to request your **person**

### Example

```typescript
import {
    PeopleApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new PeopleApi(configuration);

let id: string; //Object id. (default to undefined)
let depth: 0 | 1 | 2; //Determines the level of nested related objects to include in the response.       - 0: Returns only the primary object\'s information.       - 1: Returns the primary object along with its directly related objects (with no additional nesting for related objects).       - 2: Returns the primary object, its directly related objects, and the related objects of those related objects. (optional) (default to 1)

const { status, data } = await apiInstance.findOnePerson(
    id,
    depth
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**string**] | Object id. | defaults to undefined|
| **depth** | [**0 | 1 | 2**]**Array<0 &#124; 1 &#124; 2>** | Determines the level of nested related objects to include in the response.       - 0: Returns only the primary object\&#39;s information.       - 1: Returns the primary object along with its directly related objects (with no additional nesting for related objects).       - 2: Returns the primary object, its directly related objects, and the related objects of those related objects. | (optional) defaults to 1|


### Return type

**FindOnePerson200Response**

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

# **findPersonDuplicates**
> FindPersonDuplicates200Response findPersonDuplicates(findPersonDuplicatesRequest)

**depth** can be provided to request your **person**

### Example

```typescript
import {
    PeopleApi,
    Configuration,
    FindPersonDuplicatesRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new PeopleApi(configuration);

let findPersonDuplicatesRequest: FindPersonDuplicatesRequest; //body
let depth: 0 | 1 | 2; //Determines the level of nested related objects to include in the response.       - 0: Returns only the primary object\'s information.       - 1: Returns the primary object along with its directly related objects (with no additional nesting for related objects).       - 2: Returns the primary object, its directly related objects, and the related objects of those related objects. (optional) (default to 1)

const { status, data } = await apiInstance.findPersonDuplicates(
    findPersonDuplicatesRequest,
    depth
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **findPersonDuplicatesRequest** | **FindPersonDuplicatesRequest**| body | |
| **depth** | [**0 | 1 | 2**]**Array<0 &#124; 1 &#124; 2>** | Determines the level of nested related objects to include in the response.       - 0: Returns only the primary object\&#39;s information.       - 1: Returns the primary object along with its directly related objects (with no additional nesting for related objects).       - 2: Returns the primary object, its directly related objects, and the related objects of those related objects. | (optional) defaults to 1|


### Return type

**FindPersonDuplicates200Response**

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

# **updateOnePerson**
> UpdateOnePerson200Response updateOnePerson(personForUpdate)


### Example

```typescript
import {
    PeopleApi,
    Configuration,
    PersonForUpdate
} from './api';

const configuration = new Configuration();
const apiInstance = new PeopleApi(configuration);

let id: string; //Object id. (default to undefined)
let personForUpdate: PersonForUpdate; //body
let depth: 0 | 1 | 2; //Determines the level of nested related objects to include in the response.       - 0: Returns only the primary object\'s information.       - 1: Returns the primary object along with its directly related objects (with no additional nesting for related objects).       - 2: Returns the primary object, its directly related objects, and the related objects of those related objects. (optional) (default to 1)

const { status, data } = await apiInstance.updateOnePerson(
    id,
    personForUpdate,
    depth
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **personForUpdate** | **PersonForUpdate**| body | |
| **id** | [**string**] | Object id. | defaults to undefined|
| **depth** | [**0 | 1 | 2**]**Array<0 &#124; 1 &#124; 2>** | Determines the level of nested related objects to include in the response.       - 0: Returns only the primary object\&#39;s information.       - 1: Returns the primary object along with its directly related objects (with no additional nesting for related objects).       - 2: Returns the primary object, its directly related objects, and the related objects of those related objects. | (optional) defaults to 1|


### Return type

**UpdateOnePerson200Response**

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

