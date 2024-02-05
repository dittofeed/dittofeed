import * as React from 'react';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { propertiesStore } from '../pages/users.page';
import { Box, Select, TextField } from '@mui/material';
import apiRequestHandlerFactory from '../lib/apiRequestHandlerFactory';
import { GetComputedPropertyAssignmentResourcesResponse } from 'isomorphic-lib/src/types';
import { useAppStore } from '../lib/appStore';

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
    setTimeout(() => {
        setSelectedProperty('')
        setStage(false)
    }, 300)
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
            (property) => <MenuItem onClick={() => handleStageChange(properties[property] as string)}>{property}</MenuItem>)
          }
        </>
    )
}

function filterStrings(inputStr: string, stringArray: string[]) {
    return stringArray.filter(str => str.toLowerCase().includes(inputStr.toLowerCase()));
}

function Selector() {
  const selectedPropertyValues = propertiesStore((store) => store.selectedPropertyValues)
  const setSelectedProperySelectedValue = propertiesStore((store) => store.setSelectedPropertySelectedValue)
  const selectedProperty = propertiesStore((store) => store.selectedProperty);
  const getUserPropertiesRequest = propertiesStore((store) => store.getUserPropertiesRequest);
  const setGetUserPropertiesRequest = propertiesStore((store) => store.setGetUserPropertiesRequest);
  const setSelectedPropertyValues = propertiesStore((store) => store.setSelectedPropertyValues);
  const apiBase = useAppStore((state) => state.apiBase);
  const [filter, setFilter] = React.useState('');
  const selectedPropertySelectedValue = propertiesStore((store) => store.selectedPropertySelectedValue);

  const propertyNames = React.useMemo(() => Object.keys(selectedPropertyValues), [selectedPropertyValues])
  const filteredProperties = React.useMemo(() => {
        if (filter === '') return propertyNames 
        return filterStrings(filter, propertyNames)
    }, [filter, propertyNames])

  React.useEffect(() => {
    const setLoadResponse = (response: GetComputedPropertyAssignmentResourcesResponse) => {
        setSelectedPropertyValues(response.values)
    };

    const handler = apiRequestHandlerFactory({
      request: getUserPropertiesRequest,
      setRequest: setGetUserPropertiesRequest,
      responseSchema: GetComputedPropertyAssignmentResourcesResponse,
      setResponse: setLoadResponse,
      requestConfig: {
        method: "GET",
        url: `${apiBase}/api/user-properties/values`,
        params: {
           propertyId: selectedProperty,
           workspaceId: "58290c8f-6c59-460f-a8f1-777033c8ded1" 
        },
        headers: {
          "Content-Type": "application/json",
        },
      },
    });
    handler();
  }, [selectedProperty])


    return (
        <Box component="section">
          <TextField id="outlined-basic" variant="outlined" onChange={(e) => setFilter(e.target.value)}/>

          {filteredProperties.map(
            (property) => <MenuItem onClick={() => setSelectedProperySelectedValue(selectedPropertyValues[property] as string)}>{property}</MenuItem>)
          }
        </Box>
    )
}
