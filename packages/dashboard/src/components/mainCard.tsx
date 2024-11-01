import {
  Card,
  CardContent,
  CardHeader,
  Divider,
  Typography,
} from "@mui/material";
// material-ui
import { SxProps, Theme, useTheme } from "@mui/material/styles";
import React, { ForwardedRef, forwardRef } from "react";

// header style
const headerSX = {
  p: 2.5,
  "& .MuiCardHeader-action": { m: "0px auto", alignSelf: "center" },
};

// ==============================|| CUSTOM - MAIN CARD ||============================== //

export interface MainCardProps extends React.ComponentProps<typeof Card> {
  border?: boolean;
  children?: React.ReactNode;
  content?: string;
  darkTitle?: boolean;
  boxShadow?: boolean;
  divider?: boolean;
  elevation?: number;
  shadow?: number;
  secondary?: React.ReactNode;
  sx?: SxProps<Theme>;
  contentSX?: SxProps<Theme>;
  title?: string;
}

function MainCardInner({
  border = true,
  boxShadow,
  children,
  content,
  contentSX = {},
  darkTitle,
  divider = true,
  elevation,
  secondary,
  shadow,
  cardRef,
  sx = {},
  title,
  ...others
}: { cardRef?: ForwardedRef<HTMLDivElement> } & MainCardProps) {
  const theme = useTheme();
  boxShadow = theme.palette.mode === "dark" ? !!boxShadow || true : boxShadow;

  return (
    <Card
      elevation={elevation ?? 0}
      ref={cardRef}
      sx={{
        ...sx,
        border: border ? "1px solid" : "none",
        borderRadius: 2,
        borderColor:
          theme.palette.mode === "dark"
            ? theme.palette.divider
            : theme.palette.grey.A800,
        boxShadow:
          boxShadow && (!border || theme.palette.mode === "dark")
            ? shadow ?? theme.customShadows.z1
            : "inherit",
        ":hover": {
          boxShadow: boxShadow ? shadow ?? theme.customShadows.z1 : "inherit",
        },
        "& pre": {
          m: 0,
          p: "16px !important",
          fontFamily: theme.typography.fontFamily,
          fontSize: "0.75rem",
        },
      }}
      {...others}
    >
      {/* card header and action */}
      {!darkTitle && title && (
        <CardHeader
          sx={headerSX}
          titleTypographyProps={{ variant: "subtitle1" }}
          title={title}
          action={secondary}
        />
      )}
      {darkTitle && title && (
        <CardHeader
          sx={headerSX}
          title={<Typography variant="h3">{title}</Typography>}
          action={secondary}
        />
      )}

      {/* content & header divider */}
      {title && divider && <Divider />}

      {/* card content */}
      {content && <CardContent sx={contentSX}>{children}</CardContent>}
      {!content && children}
    </Card>
  );
}

const MainCard = forwardRef<HTMLDivElement, MainCardProps>((props, ref) => (
  <MainCardInner cardRef={ref} {...props} />
));
MainCard.displayName = "MainCard";

export default MainCard;
