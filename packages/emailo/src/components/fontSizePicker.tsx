import * as Dropdown from "@radix-ui/react-dropdown-menu";
import React, { useCallback } from "react";

import { DropdownButton } from "./dropdown";
import { Icon } from "./icon";
import { Surface } from "./surface";
import { Toolbar } from "./toolbar";

const FONT_SIZES = [
  { label: "Small", value: "10" },
  { label: "Medium", value: "12pt" },
  { label: "Large", value: "16pt" },
  { label: "Extra Large", value: "22pt" },
];

export type FontSizePickerProps = {
  onChange: (value: string) => void; // eslint-disable-line no-unused-vars
  value: string;
};

export function FontSizePicker({ onChange, value }: FontSizePickerProps) {
  const currentValue = FONT_SIZES.find((size) => size.value === value);
  const currentSizeLabel = currentValue?.label.split(" ")[0] || "Medium";

  const selectSize = useCallback(
    (size: string) => () => onChange(size),
    [onChange],
  );

  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        <Toolbar.Button active={!!currentValue?.value}>
          {currentSizeLabel}
          <Icon name="ChevronDown" className="w-2 h-2" />
        </Toolbar.Button>
      </Dropdown.Trigger>
      <Dropdown.Content asChild>
        <Surface className="flex flex-col gap-1 px-2 py-4">
          {FONT_SIZES.map((size) => (
            <DropdownButton
              isActive={value === size.value}
              onClick={selectSize(size.value)}
              key={`${size.label}_${size.value}`}
            >
              <span style={{ fontSize: size.value }}>{size.label}</span>
            </DropdownButton>
          ))}
        </Surface>
      </Dropdown.Content>
    </Dropdown.Root>
  );
}
