import * as React from 'react';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { Box, TextField } from '@mui/material';
import apiRequestHandlerFactory from '../lib/apiRequestHandlerFactory';
import { GetComputedPropertyAssignmentResourcesResponse } from 'isomorphic-lib/src/types';
import { useAppStore } from '../lib/appStore';
import { FilterOptions, propertiesStore } from './usersFilter';

enum Stage {
    "SELECTING_FILTER",
    "SELECTING_ID",
    "SELECTING_VALUE"
}

export default function FilterSelector({
    workspaceId
} : {
    workspaceId: string
}) {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const [stage, setStage] = React.useState<Stage>(Stage.SELECTING_FILTER);
  const setSelectedProperty = propertiesStore((store) => store.setSelectedProperty);
  const setSelectedPropertySelectedValue = propertiesStore((store) => store.setSelectedPropertySelectedValue);
  const setSelectedFilter = propertiesStore((store) => store.setSelectedFilter);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
        setAnchorEl(null);
        setTimeout(() => {
            setSelectedProperty('')
            setSelectedFilter(FilterOptions.NONE)
            setStage(Stage.SELECTING_FILTER)
        }, 300)
  };

  const handleFilterSelection = (selectedFilter: FilterOptions) => {
      setSelectedFilter(selectedFilter)
      setStage(Stage.SELECTING_ID)
  }

  const handlePropertySelection = (selectedProperty: string) => {
    setSelectedProperty(selectedProperty)
    setStage(Stage.SELECTING_VALUE)
  }

    const handleValueSelection = (propertyAssignmentId: string) => {
        setSelectedPropertySelectedValue(propertyAssignmentId)
        handleClose()
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
      { stage === Stage.SELECTING_FILTER
        ? <FilterSelectors handleFilterSelection={handleFilterSelection}/>
        : stage === Stage.SELECTING_ID 
            ? <PropertiesSelector handleStageChange={handlePropertySelection}/> 
            : <PropertyValuesSelector 
                handleValueSelection={handleValueSelection}
                workspaceId={workspaceId}
              />
        }
      </Menu>
    </div>
  );
}

function FilterSelectors({
  handleFilterSelection
}: {
  handleFilterSelection: (selectedFilter: FilterOptions) => void
}) {
    return (
        <>
        <MenuItem onClick={() => handleFilterSelection(FilterOptions.USER_PROPERTY)}>User Property</MenuItem> 
        <MenuItem onClick={() => handleFilterSelection(FilterOptions.SEGMENTS)}>Segment</MenuItem> 
        </>
    )
}

function PropertiesSelector({
    handleStageChange
} : {
    handleStageChange: (selectedProperty: string) => void
}) {
    const properties = propertiesStore((store) => store.properties)
    return (
        <>
          {Object.values(properties).map(
            (property,key) => <MenuItem key={key} onClick={() => handleStageChange(Object.keys(properties)[key] as string)}>{property}</MenuItem>)
          }
        </>
    )
}

function PropertyValuesSelector({
    handleValueSelection,
    workspaceId
} : {
    handleValueSelection: (propertyAssignmentId: string) => void,
    workspaceId: string
}) {
  const propertiesValues = propertiesStore((store) => store.propertiesValues)
  const selectedProperty = propertiesStore((store) => store.selectedProperty);
  const getUserPropertiesRequest = propertiesStore((store) => store.getUserPropertiesRequest);
  const setGetUserPropertiesRequest = propertiesStore((store) => store.setGetUserPropertiesRequest);
  const setPropertiesValues = propertiesStore((store) => store.setPropertiesValues);
  const apiBase = useAppStore((store) => store.apiBase);

  const [filter, setFilter] = React.useState('');
  const selectedPropertyValues = React.useMemo(() => propertiesValues[selectedProperty], [selectedProperty, propertiesValues])
  const propertyNames = React.useMemo(() => Object.values(selectedPropertyValues ?? {}), [selectedPropertyValues])

    function filterStrings(inputStr: string, stringArray: string[]) {
        if (inputStr === '') return stringArray;
        return stringArray.filter(str => str.toLowerCase().includes(inputStr.toLowerCase()));
    }
  const filteredProperties = React.useMemo(() => filterStrings(filter, propertyNames), [filter, propertyNames])

  React.useEffect(() => {
    const setLoadResponse = (response: GetComputedPropertyAssignmentResourcesResponse) => {
        setPropertiesValues(response.values)
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
           workspaceId: workspaceId
        },
        headers: {
          "Content-Type": "application/json",
        },
      },
    });

    if (!propertiesValues[selectedProperty]) {
        handler();
    }
  }, [selectedProperty])



    return (
        <Box component="section">
          <TextField id="outlined-basic" variant="outlined" onChange={(e) => setFilter(e.target.value)}/>

          {selectedPropertyValues && filteredProperties.map(
            (property, key) => 
                <MenuItem 
                    key={key} 
                    onClick={() => handleValueSelection(Object.keys(selectedPropertyValues)[key] as string)}
                >
                    {property}
                </MenuItem>)
          }
        </Box>
    )
}
