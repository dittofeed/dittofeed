import React, { useState, MouseEvent, TouchEvent, SyntheticEvent } from 'react';
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
} from '@mui/material';

const stopPropagation = (e: MouseEvent | TouchEvent | SyntheticEvent) => {
  e.stopPropagation();
};

interface FlowSelectProps {
  options: { value: string; label: string }[];
}

const FlowSelect: React.FC<FlowSelectProps> = ({ options }) => {
  const [value, setValue] = useState<string>('');
  const [open, setOpen] = useState<boolean>(false);

  const handleChange = (e: SelectChangeEvent<string>) => {
    setValue(e.target.value);
  };

  const handleOpen = (e: SyntheticEvent) => {
    stopPropagation(e);
    setOpen(true);
  };

  const handleClose = (e: SyntheticEvent) => {
    stopPropagation(e);
    setOpen(false);
  };

  return (
    <FormControl fullWidth size="small">
      <InputLabel id="flow-select-label">Choose</InputLabel>
      <Select
        labelId="flow-select-label"
        id="flow-select"
        value={value}
        open={open}
        onOpen={handleOpen}
        onClose={handleClose}
        onChange={handleChange}

        // prevent React Flow from hijacking pointer events on the trigger
        onMouseDownCapture={stopPropagation}
        onTouchStartCapture={stopPropagation}
        onPointerDownCapture={stopPropagation}

        MenuProps={{
          // render the menu inside the node so its events bubble through our wrapper
          disablePortal: true,
          PaperProps: {
            // also block pointer events coming *out* of the menu itself
            onMouseDownCapture: stopPropagation,
            onTouchStartCapture: stopPropagation,
            onPointerDownCapture: stopPropagation,
          },
        }}
      >
        {options.map((opt) => (
          <MenuItem key={opt.value} value={opt.value}>
            {opt.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};

export default FlowSelect;
