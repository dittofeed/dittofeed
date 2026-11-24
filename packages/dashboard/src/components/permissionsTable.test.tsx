/**
 * @jest-environment jsdom
 */
import { RoleEnum, WorkspaceMemberWithRoles } from "isomorphic-lib/src/types";
import { act } from "react";
import { createRoot, Root } from "react-dom/client";

import { PermissionsTable } from "./permissionsTable";

const mockCreatePermission = jest.fn();
const mockUpdatePermission = jest.fn();
const mockDeletePermission = jest.fn();

const memberEmail = "shady.duan@mirmiles.com";

const mockMemberWithRole: WorkspaceMemberWithRoles = {
  member: {
    id: "member-1",
    email: memberEmail,
    emailVerified: true,
    createdAt: "2025-01-01T00:00:00.000Z",
  },
  roles: [
    {
      role: RoleEnum.Admin,
      workspaceMemberId: "member-1",
      workspaceId: "workspace-1",
      workspaceName: "JustFab",
    },
  ],
};

const mockPermissions = {
  memberRoles: [mockMemberWithRole],
};

jest.mock("../lib/usePermissionsQuery", () => ({
  usePermissionsQuery: () => ({
    data: mockPermissions,
    isLoading: false,
    error: null,
  }),
}));

jest.mock("../lib/usePermissionsMutations", () => ({
  useCreatePermissionMutation: () => ({
    mutate: mockCreatePermission,
    isPending: false,
  }),
  useUpdatePermissionMutation: () => ({
    mutate: mockUpdatePermission,
    isPending: false,
  }),
  useDeletePermissionMutation: () => ({
    mutate: mockDeletePermission,
    isPending: false,
  }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function click(element: Element) {
  act(() => {
    element.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  });
}

function findButton(container: ParentNode, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.includes(label),
  );
  if (!button) {
    throw new Error(`Button "${label}" not found`);
  }
  return button;
}

function findEmailInput(dialog: ParentNode): HTMLInputElement {
  const input = dialog.querySelector<HTMLInputElement>("input[type='text']");
  if (!input) {
    throw new Error("Email input not found");
  }
  return input;
}

describe("PermissionsTable permission dialog", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<PermissionsTable />);
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  function openEditDialog() {
    const actionsButton = container.querySelector(
      "button[aria-label='actions']",
    );
    if (!actionsButton) {
      throw new Error("Actions button not found");
    }
    click(actionsButton);
    const editItem = Array.from(
      document.querySelectorAll("[role='menuitem']"),
    ).find((candidate) => candidate.textContent?.trim() === "Edit");
    if (!editItem) {
      throw new Error("Edit menu item not found");
    }
    click(editItem);
    const dialog = document.querySelector("[role='dialog']");
    if (!dialog) {
      throw new Error("Permission dialog not found");
    }
    return dialog;
  }

  it("seeds the form from the selected member and submits the seeded values", () => {
    const dialog = openEditDialog();

    // Regression: the dialog is mounted before a member is selected, so without
    // re-seeding on open the email is empty and the Update button stays
    // disabled.
    expect(findEmailInput(dialog).value).toBe(memberEmail);

    const updateButton = findButton(dialog, "Update");
    expect(updateButton.disabled).toBe(false);

    click(updateButton);
    expect(mockUpdatePermission).toHaveBeenCalledTimes(1);
    expect(mockUpdatePermission).toHaveBeenCalledWith({
      email: memberEmail,
      role: RoleEnum.Admin,
    });
  });

  it("resets the form when switching from edit to add", () => {
    const dialog = openEditDialog();
    expect(findEmailInput(dialog).value).toBe(memberEmail);

    click(findButton(dialog, "Cancel"));

    click(findButton(container, "Add Permission"));
    const addDialog = document.querySelector("[role='dialog']");
    if (!addDialog) {
      throw new Error("Add permission dialog not found");
    }
    expect(findEmailInput(addDialog).value).toBe("");
  });
});
