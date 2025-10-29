# Email Lowcode V2

This document will describe the implementation details for the new version of our low code email editor. This new version is intended to be better suited to more heavily designed emails, and be more intuitive for less technical users.

It's also intended to (eventually) be exported as its own independent package, and as such we're designing it to be "headless" so that the styles can be controlled by the parent application.

This will involve both frontend and backend changes.

## Layout

┌──────┬──────────────────────────────┬───────┐                 
│      ┼──────────────────────────────┤       │                 
│┌┬──┬┐│                              │       │                 
│││  │││                              │       │                 
│└┴──┴┘│                              │       │                
│┌────┐│     header text              │       │                 
│└────┘│                              │       │                 
│┌────┐│                              │       │                 
│└────┘│     body text                │       │                 
│┌────┐│                              │       │                 
│└────┘│                              │       │                 
│┌────┐│     footer                   │ ┌────┐│                 
│└────┘│                              │ └────┘│                 
│      │                              │┌────┐ │                 
│      │                              │└────┘ │                 
│      │                              │┌─────┐│                 
│      │                              ││     ││                 
│      │                              │└─────┘│                 
└──────┴──────────────────────────────┴───────┘                 

There will be four basic blocks:

**The left drawer**

This will contain the node palette, the layout palette, the global settings editor, the user properties editor, and the node editor. These can be toggled between, using a set of buttons at the top of the drawer. However, only one of these will be visible at a time.

**Editor Body / Canvas**

This will contain the email canvas, which will be the main area for the user to design their email. This will be a drag and drop area for the user to add nodes to the email. Users will be able to resize nodes, and edit text within nodes. Clicking into a "paragraph" node will open an inline rich text editor, which will allow the user to edit the text within the node.

Selecting a node will also open the node editor, in the left drawer which will allow the user to edit the node's properties.

**Topbar**

The topbar will contain the following:

- A sync status indicator (green if up to date, red if not)
- A publish button (which will be disabled if the email is already up to date)
- A toggle to view the email in a mobile view
- A toggle to view the currently published email (as opposed to the current draft)
- A method to revert the draft history
- A button to open a preview of the email (as a modal)

**Right Drawer**

This will contain the AI chat assistant, which will be used to help the user design their email

## Implementation Steps

See the [AGENTS.md](AGENTS.md) file for instructions on how to work within this project.

### 1. Create limited body node types

We'll be defining typescript types in `packages/isomorphic-lib/src/types.ts` using typebox schemas. These types should define the node types:

- Paragraph
- Button
- Row

Where there are multiple variants of the Row node, with different numbers of columns.

Call the top level type `LowCodeEmailBodyNodeV2`.

### 2. Create the editor body

Create the editor body component, as `packages/dashboard/src/components/lowCodeEmailEditorV2/body.tsx`, creating the `lowCodeEmailEditorV2` folder.

Then creating a new page in `packages/dashboard/src/pages/dev/email-lowcode-v2.page.tsx`, which will render the editor body component with hardcoded for easy development and testing. Create a redirect route in `packages/dashboard/next.config.js` so that all `/dashboard/dev` requests 404 outside of dev and testing environments - be conscious of the `/dashboard` `basePath` setting.

As far as styling this component, do not use mui as in the rest of the dashboard. Instead use plain css, written in a `packages/dashboard/src/components/lowCodeEmailEditorV2/styles.css` file, which should be imported into the page.

### 3. Create a method to convert the editor body to MJML

Implement a new directory and file `packages/backend-lib/src/lowCodeEmailV2/body.ts`. Implement a method `lowCodeBodyToMjml` which will convert the editor body to an MJML string.
