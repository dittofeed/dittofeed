import { Box, Stack, Typography } from "@mui/material"
import React from "react"

import FieldSection from "./FieldSection"
import { FieldsProps } from "./types"

function Fields({ title, description, sections, children, id }: FieldsProps) {
  return (
    <Stack spacing={3}>
      <Box id={`${id}`}>
        <Typography variant="h2" fontWeight={500} sx={{ fontSize: 20, marginBottom: 0.5 }}>
          {title}
        </Typography>
        <Typography variant="subtitle1" fontWeight="normal" sx={{ opacity: 0.6 }}>
          {description}
        </Typography>
      </Box>
      <Stack
        sx={{
          backgroundColor: "white",
          borderRadius: 3,
          px: 4,
          py: 2,
          marginTop: 4,
          borderWidth: "1px",
          borderStyle: "solid",
          borderColor: "grey.200"
        }}
      >
        {
          sections.map((section) => <FieldSection key={section.id} {...section} />)
        }
        {children ? (
          <Stack
            sx={{
              borderTopWidth: "1px",
              borderTopStyle: "solid",
              borderTopColor: "grey.200",
              pt: 2,
              mt: 4,
              display: "flex",
              justifyContent: "end"
            }}
          >
            {children}
          </Stack>
        ) : null}
      </Stack>
    </Stack>
  )
}

export default Fields
