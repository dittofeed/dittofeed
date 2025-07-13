- add a new component configuration for template builder
- add a new MessageTemplateConfiguration schema equivalent to BroadcastConfiguration
- this new configuration should include

```typescript
  allowedEmailContentsTypes: Type.Optional(Type.Array(EmailContentsTypeEnum)),
  lowCodeEmailDefaultType: Type.Optional(LowCodeEmailDefaultType),
```

similar to the BroadcastConfiguration

- this configuration should take effect when:
  - creating a new template from the template view
  - initializing a new template when switching between code and lowcode modes in the editor