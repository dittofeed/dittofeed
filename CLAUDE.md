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

- the configuration should be passed optionally through the table and editor components. they shouldn't be retrieved from the API directly. instead the configuration values will be optionally passed into these component props from a parent project which loads this code through a git submodule. this parent project is not accessible to the claude agent.