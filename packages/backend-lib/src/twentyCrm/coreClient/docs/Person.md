# Person

A person

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**name** | [**PersonName**](PersonName.md) |  | [optional] [default to undefined]
**companyId** | **string** |  | [optional] [default to undefined]
**createdBy** | [**CompanyCreatedBy**](CompanyCreatedBy.md) |  | [optional] [default to undefined]
**position** | **number** | Person record Position | [optional] [default to undefined]
**avatarUrl** | **string** | Contact’s avatar | [optional] [default to undefined]
**city** | **string** | Contact’s city | [optional] [default to undefined]
**phones** | [**PersonPhones**](PersonPhones.md) |  | [optional] [default to undefined]
**jobTitle** | **string** | Contact’s job title | [optional] [default to undefined]
**xLink** | [**PersonXLink**](PersonXLink.md) |  | [optional] [default to undefined]
**linkedinLink** | [**PersonLinkedinLink**](PersonLinkedinLink.md) |  | [optional] [default to undefined]
**emails** | [**PersonEmails**](PersonEmails.md) |  | [optional] [default to undefined]

## Example

```typescript
import { Person } from './api';

const instance: Person = {
    name,
    companyId,
    createdBy,
    position,
    avatarUrl,
    city,
    phones,
    jobTitle,
    xLink,
    linkedinLink,
    emails,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
