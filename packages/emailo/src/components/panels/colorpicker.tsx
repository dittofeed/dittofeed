import React, { useCallback, useState } from "react";
import { HexColorPicker } from "react-colorful";

import { themeColors } from "../../constants";
import { Icon } from "../icon";
import { Toolbar } from "../toolbar";
import { ColorButton } from "./colorPicker/colorButton";

export type ColorPickerProps = {
  color?: string;
  onChange?: (color: string) => void;
  onClear?: () => void;
};

export function ColorPicker({ color, onChange, onClear }: ColorPickerProps) {
  const [colorInputValue, setColorInputValue] = useState(color || "");
  const handleColorChangeCallback = useCallback(
    (newColor: string) => {
      queueMicrotask(() => {
        try {
          onChange?.(newColor);
        } catch (error) {
          console.error("Error in color change callback:", error);
        }
      });
    },
    [onChange],
  );

  const handleColorUpdate = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setColorInputValue(event.target.value);
    },
    [],
  );

  const handleColorChange = useCallback(() => {
    const isCorrectColor = /^#([0-9A-F]{3}){1,2}$/i.test(colorInputValue);

    if (!isCorrectColor) {
      if (handleColorChangeCallback) {
        handleColorChangeCallback("");
      }
      return;
    }

    if (handleColorChangeCallback) {
      handleColorChangeCallback(colorInputValue);
    }
  }, [colorInputValue, handleColorChangeCallback]);

  return (
    <div className="flex flex-col gap-2">
      <HexColorPicker
        className="w-full"
        color={color || ""}
        onChange={handleColorChangeCallback}
      />
      <input
        type="text"
        className="w-full p-2 text-black bg-white border rounded dark:bg-black dark:text-white border-neutral-200 dark:border-neutral-800 focus:outline-1 focus:ring-0 focus:outline-neutral-300 dark:focus:outline-neutral-700"
        placeholder="#000000"
        value={colorInputValue}
        onChange={handleColorUpdate}
        onBlur={handleColorChange}
      />
      <div className="flex flex-wrap items-center gap-1 max-w-[15rem]">
        {themeColors.map((currentColor) => (
          <ColorButton
            active={currentColor === color}
            color={currentColor}
            key={currentColor}
            onColorChange={handleColorChangeCallback}
          />
        ))}
        <Toolbar.Button
          tooltip="Reset color to default"
          onClick={() => {
            queueMicrotask(() => {
              onClear?.();
            });
          }}
        >
          <Icon name="Undo" />
        </Toolbar.Button>
      </div>
    </div>
  );
}
