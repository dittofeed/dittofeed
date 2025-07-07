# PersonForResponse

A person

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**name** | [**PersonName**](PersonName.md) |  | [optional] [default to undefined]
**companyId** | **string** |  | [optional] [default to undefined]
**deletedAt** | **string** | Date when the record was deleted | [optional] [default to undefined]
**updatedAt** | **string** | Last time the record was changed | [optional] [default to undefined]
**createdAt** | **string** | Creation date | [optional] [default to undefined]
**id** | **string** | Id | [optional] [default to undefined]
**createdBy** | [**CompanyForResponseCreatedBy**](CompanyForResponseCreatedBy.md) |  | [optional] [default to undefined]
**position** | **number** | Person record Position | [optional] [default to undefined]
**avatarUrl** | **string** | Contact’s avatar | [optional] [default to undefined]
**city** | **string** | Contact’s city | [optional] [default to undefined]
**phones** | [**PersonPhones**](PersonPhones.md) |  | [optional] [default to undefined]
**jobTitle** | **string** | Contact’s job title | [optional] [default to undefined]
**xLink** | [**PersonXLink**](PersonXLink.md) |  | [optional] [default to undefined]
**linkedinLink** | [**PersonLinkedinLink**](PersonLinkedinLink.md) |  | [optional] [default to undefined]
**emails** | [**PersonEmails**](PersonEmails.md) |  | [optional] [default to undefined]
**company** | **object** |  | [optional] [default to undefined]
**pointOfContactForOpportunities** | **Array&lt;object&gt;** | List of opportunities for which that person is the point of contact | [optional] [default to undefined]
**taskTargets** | **Array&lt;object&gt;** | Tasks tied to the contact | [optional] [default to undefined]
**noteTargets** | **Array&lt;object&gt;** | Notes tied to the contact | [optional] [default to undefined]
**attachments** | **Array&lt;object&gt;** | Attachments linked to the contact. | [optional] [default to undefined]
**favorites** | **Array&lt;object&gt;** | Favorites linked to the contact | [optional] [default to undefined]
**messageParticipants** | [**Array&lt;ObjeGct&gt;**](ObjeGct.md) | Message Participants | [optional] [default to undefined]
**calendarEventParticipants** | **Array&lt;object&gt;** | Calendar Event Participants | [optional] [default to undefined]
**timelineActivities** | **Array&lt;object&gt;** | Events linked to the person | [optional] [default to undefined]

## Example

```typescript
import { PersonForResponse } from './api';

const instance: PersonForResponse = {
    name,
    companyId,
    deletedAt,
    updatedAt,
    createdAt,
    id,
    createdBy,
    position,
    avatarUrl,
    city,
    phones,
    jobTitle,
    xLink,
    linkedinLink,
    emails,
    company,
    pointOfContactForOpportunities,
    taskTargets,
    noteTargets,
    attachments,
    favorites,
    messageParticipants,
    calendarEventParticipants,
    timelineActivities,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
