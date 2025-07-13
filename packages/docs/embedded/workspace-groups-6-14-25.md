## Basic Proposal

I need help designing a core part of my application.

I'm building a customer engagement platform in the style of Braze, Customer.io, and Iterable.

My application has a concept of a "Workspace" which represents a tenant. User data, and configuration is isolated to a workspace.

One thing that makes our application unique is that we have a complimentary prouduct we call "embedded components".

This product allows you to "embed" various parts of our base application into your own application. For, example, you can embed: 

- A drag and drop journey editor
- A broadcast editor
- An email editor
etc.

This allows you to incorporate message automation into your own application, saving you the development time of implmenting it on your own, while maintaining your own branding. The primary use case for this product is vertical B2B SaaS applications, e.g.

- An app to allow property managers to send messages to their tenants
- An app to allow doctors to find, and contact patients for clinical trials
etc.

In contrast to our base product, which is a standard "B2B" product, this embedded component product is a "B2B2C" product.

Currently we have three types of workspaces:

- "Parent": A workspace representing a customer of ours, using our embedded components product e.g. "Property Manager App - Production".
- "Child": A workspace that is a child to a parent workspace e.g. "Individual Property". These are the customers of our customers, for our embedded product.
- "Root": A workspace within our base product.

I'd like to implement a new "Workspace Group" feature. This feature would allow child workspaces to be grouped together within a parent workspace. This would allow us to model businesses which might be hierarchical.

For example,a property management company might have multiple properties. Individual property managers should only be able to see and manage the properties they are responsible for but the property management company should be able to access all properties.

Ideally these could be composed, in a way where the workspace groups can be arbitrarily overlapped and nested. This *could* be used to represent a strict hierarchy like a tree, but could also be used to represent other relationships. For example, a member of the property managment company might be responsible for a subset of the properties managed by the company, while another member might be responsible for a different overlapping subset.

Someone who manages a workspace group should be able to:
- Create and send "broadcasts" (bulk messages like emails, SMS, etc.) to all users in all child workspaces in the group.
- Create and configure "journeys" (message automation) to be sent to all users in all child workspaces in the group.

To start, help me think through this design. Do you have any feedback? Does it make sense? Would you do anything differently?

## On Resources

In dittofeed, we call domain objects like "broadcast", "resources". Resources are scoped to a workspace. They're scoped to child workspaces in the case of our embedded product, and root workspaces in the case of our base product.

If we want to allow teams to create broadcasts for entire workspace groups, I can see two options:

- Modify these resources to allow them to be scoped to a workspace group.
- Denormalize the resources, so that creating them in a workspace group creates a resource for each child workspace in the group.

What do you think?