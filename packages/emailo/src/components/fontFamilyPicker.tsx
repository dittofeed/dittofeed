import * as Dropdown from "@radix-ui/react-dropdown-menu";
import React, { useCallback } from "react";

import { DropdownButton, DropdownCategoryTitle } from "./dropdown";
import { Icon } from "./icon";
import { Surface } from "./surface";
import { Toolbar } from "./toolbar";

const FONT_FAMILY_GROUPS = [
  {
    label: "Sans Serif",
    options: [
      { label: "Arial", value: "Arial" },
      { label: "Calibri", value: "Calibri" },
      { label: "Helvetica", value: "Helvetica" },
      { label: "Tahoma", value: "Tahoma" },
      { label: "Trebuchet MS", value: "Trebuchet MS" },
      { label: "Verdana", value: "Verdana" },
    ],
  },
  {
    label: "Serif",
    options: [
      { label: "Times New Roman", value: "Times New Roman" },
      { label: "Georgia", value: "Georgia" },
      { label: "Palatino", value: "Palatino" },
    ],
  },
  {
    label: "Monospace",
    options: [
      { label: "Courier", value: "Courier" },
      { label: "Courier New", value: "Courier New" },
    ],
  },
];

const FONT_FAMILIES = FONT_FAMILY_GROUPS.flatMap((group) => [
  group.options,
]).flat();

export type FontFamilyPickerProps = {
  onChange: (value: string) => void; // eslint-disable-line no-unused-vars
  value: string;
};

export function FontFamilyPicker({ onChange, value }: FontFamilyPickerProps) {
  const currentValue = FONT_FAMILIES.find((font) => font.value === value);
  const currentFontLabel = currentValue?.label ?? "Arial";

  const selectFont = useCallback(
    (font: string) => () => onChange(font),
    [onChange],
  );

  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        <Toolbar.Button active={!!currentValue?.value}>
          {currentFontLabel}
          <Icon name="ChevronDown" className="w-2 h-2" />
        </Toolbar.Button>
      </Dropdown.Trigger>
      <Dropdown.Content asChild>
        <Surface className="flex flex-col gap-1 px-2 py-4">
          {FONT_FAMILY_GROUPS.map((group) => (
            <div
              className="mt-2.5 first:mt-0 gap-0.5 flex flex-col"
              key={group.label}
            >
              <DropdownCategoryTitle>{group.label}</DropdownCategoryTitle>
              {group.options.map((font) => (
                <DropdownButton
                  isActive={value === font.value}
                  onClick={selectFont(font.value)}
                  key={`${font.label}_${font.value}`}
                >
                  <span style={{ fontFamily: font.value }}>{font.label}</span>
                </DropdownButton>
              ))}
            </div>
          ))}
        </Surface>
      </Dropdown.Content>
    </Dropdown.Root>
  );
}
