import * as React from 'react';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { propertiesStore } from '../pages/users.page';
import { Box, Select, TextField } from '@mui/material';

export default function UserFilter() {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const [stage, setStage] = React.useState(false);
  const setSelectedProperty = propertiesStore((store) => store.setSelectedProperty);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleStageChange = (selectedProperty: string) => {
    setSelectedProperty(selectedProperty)
    setStage(true)
  }

  return (
    <div>
      <Button
        id="basic-button"
        aria-controls={open ? 'basic-menu' : undefined}
        aria-haspopup="true"
        aria-expanded={open ? 'true' : undefined}
        onClick={handleClick}
      >
       Filter
      </Button>
      <Menu
        id="basic-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        MenuListProps={{
          'aria-labelledby': 'basic-button',
        }}
      >
       {!stage ? <UserProperties handleStageChange={handleStageChange}/> : <Selector/>}
      </Menu>
    </div>
  );
}

function UserProperties({
    handleStageChange
} : {
    handleStageChange: (selectedProperty: string) => void
}) {
    const properties = propertiesStore((store) => store.properties)

    return (
        <>
          {Object.keys(properties).map(
            (property) => <MenuItem onClick={() => handleStageChange(property)}>{property}</MenuItem>)
          }
        </>
    )
}

function filterStrings(inputStr: string, stringArray: string[]) {
    return stringArray.filter(str => str.includes(inputStr));
}

function Selector() {
    const propertyObjects = propertiesStore((store) => store.properties)

    const propertyNames = React.useMemo(() => Object.keys(propertyObjects), [])
    const [filter, setFilter] = React.useState('');
    const filteredProperties = React.useMemo(() => {
        if (filter === '') return propertyNames 
        return filterStrings(filter, propertyNames)
    }, [filter])

    return (
        <Box component="section">
          <TextField id="outlined-basic" variant="outlined" onChange={(e) => setFilter(e.target.value)}/>

          {filteredProperties.map(
            (property) => <MenuItem onClick={() => console.log(true)}>{property}</MenuItem>)
          }
        </Box>
    )
}
