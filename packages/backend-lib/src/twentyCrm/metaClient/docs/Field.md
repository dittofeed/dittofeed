# Field

A field

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**type** | **string** |  | [default to undefined]
**objectMetadataId** | **string** |  | [default to undefined]
**name** | **string** |  | [default to undefined]
**label** | **string** |  | [default to undefined]
**description** | **string** |  | [optional] [default to undefined]
**icon** | **string** |  | [optional] [default to undefined]
**defaultValue** | **any** |  | [optional] [default to undefined]
**isNullable** | **boolean** |  | [optional] [default to undefined]
**settings** | **object** |  | [optional] [default to undefined]
**_options** | [**Array&lt;FieldOptionsInner&gt;**](FieldOptionsInner.md) | For enum field types like SELECT or MULTI_SELECT | [optional] [default to undefined]

## Example

```typescript
import { Field } from './api';

const instance: Field = {
    type,
    objectMetadataId,
    name,
    label,
    description,
    icon,
    defaultValue,
    isNullable,
    settings,
    _options,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
