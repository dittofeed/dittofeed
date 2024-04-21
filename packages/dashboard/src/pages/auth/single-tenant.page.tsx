import { LoadingButton } from "@mui/lab";
import { Stack, TextField, useTheme } from "@mui/material";
import axios, { AxiosError } from "axios";
import backendConfig from "backend-lib/src/config";
import { SESSION_KEY } from "backend-lib/src/requestContext";
import { UNAUTHORIZED_PAGE } from "isomorphic-lib/src/constants";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import React from "react";

import NavCard from "../../components/layout/drawer/drawerContent/navCard";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  if (backendConfig().authMode !== "single-tenant") {
    return {
      redirect: {
        permanent: false,
        destination: UNAUTHORIZED_PAGE,
      },
    };
  }
  if (ctx.req.headers[SESSION_KEY] === "true") {
    return {
      redirect: {
        permanent: false,
        destination: "/",
      },
    };
  }
  return {
    props: {},
  };
};

const APPLICATION_ERROR = "API Error: something wen't wrong.";

export default function SingleTenantAuth() {
  const path = useRouter();
  const theme = useTheme();
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const submit = async () => {
    if (loading) {
      return;
    }
    setLoading(true);
    try {
      await axios.post("/api/public/single-tenant/login", {
        password,
      });
      path.push("/");
    } catch (e) {
      setLoading(false);
      if (!(e instanceof AxiosError) || e.response?.status !== 401) {
        setError(APPLICATION_ERROR);
        return;
      }
      setError("Invalid password");
    }
  };

  return (
    <Stack
      sx={{ width: "100%", height: "100vh" }}
      alignItems="center"
      justifyContent="center"
      direction="column"
      spacing={1}
    >
      <NavCard />
      <Stack direction="row" spacing={1}>
        <TextField
          error={!!error}
          sx={{
            maxWidth: theme.spacing(75),
            height: "3.3rem",
          }}
          label="Admin Password"
          type="password"
          value={password}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              submit();
            }
          }}
          helperText={error}
          onChange={(e) => {
            setError("");
            setPassword(e.target.value);
          }}
        />
        <LoadingButton
          disabled={loading}
          loading={loading}
          onClick={submit}
          sx={{ height: "3.3rem" }}
          variant="contained"
        >
          Login
        </LoadingButton>
      </Stack>
    </Stack>
  );
}
