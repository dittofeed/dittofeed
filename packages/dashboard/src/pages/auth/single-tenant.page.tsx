import { LoadingButton } from "@mui/lab";
import { Stack, TextField, useTheme } from "@mui/material";
import axios, { AxiosError } from "axios";
import backendConfig, { DEFAULT_BACKEND_CONFIG } from "backend-lib/src/config";
import { SESSION_KEY } from "backend-lib/src/requestContext";
import { UNAUTHORIZED_PAGE } from "isomorphic-lib/src/constants";
import { GetServerSideProps, NextPage } from "next";
import { useRouter } from "next/router";
import React from "react";

import NavCard from "../../components/layout/drawer/drawerContent/navCard";
import { getWarningStyles } from "../../lib/warningTheme";

interface SingleTenantAuthProps {
  warnings: string[];
}

export const getServerSideProps: GetServerSideProps<
  SingleTenantAuthProps
> = async (ctx) => {
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
  const warnings: string[] = [];

  const {
    password,
    databasePassword,
    clickhousePassword,
    secretKey,
    sessionCookieSecure,
  } = backendConfig();

  if (password === DEFAULT_BACKEND_CONFIG.password) {
    warnings.push(
      "Default password is being used. Please configure the PASSWORD environment variable.",
    );
  }

  if (databasePassword === DEFAULT_BACKEND_CONFIG.databasePassword) {
    warnings.push(
      "Default database password is being used. Please configure the DATABASE_PASSWORD environment variable.",
    );
  }

  if (clickhousePassword === DEFAULT_BACKEND_CONFIG.clickhousePassword) {
    warnings.push(
      "Default clickhouse password is being used. Please configure the CLICKHOUSE_PASSWORD environment variable.",
    );
  }

  if (secretKey === DEFAULT_BACKEND_CONFIG.secretKey) {
    warnings.push(
      "Default secret key is being used. Please configure the SECRET_KEY environment variable.",
    );
  }

  if (!sessionCookieSecure) {
    warnings.push(
      "Single tenant cookie is not secure. Please use tls and set SESSION_COOKIE_SECURE='true'.",
    );
  }

  return {
    props: {
      warnings,
    },
  };
};

const APPLICATION_ERROR = "API Error: something wen't wrong.";

const SingleTenantAuth: NextPage<SingleTenantAuthProps> =
  function SingleTenantAuth({ warnings }) {
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
        <Stack direction="row" spacing={1} p={3}>
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
        <Stack
          direction="column"
          spacing={1}
          sx={{
            p: 2,
            fontWeight: 600,
            ...getWarningStyles(theme),
          }}
        >
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </Stack>
      </Stack>
    );
  };

export default SingleTenantAuth;
