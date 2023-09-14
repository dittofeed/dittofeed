import { LoadingButton } from "@mui/lab";
import { Stack, TextField } from "@mui/material";
import axios, { AxiosError } from "axios";
import backendConfig from "backend-lib/src/config";
import { SESSION_KEY } from "backend-lib/src/requestContext";
import { UNAUTHORIZED_PAGE } from "isomorphic-lib/src/constants";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import React from "react";

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
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  return (
    <Stack>
      <TextField
        error={!!error}
        label="Admin Password"
        type="password"
        value={password}
        helperText={error}
        onChange={(e) => {
          setError("");
          setPassword(e.target.value);
        }}
      />
      <LoadingButton
        disabled={loading}
        loading={loading}
        onClick={async () => {
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
        }}
      >
        Login
      </LoadingButton>
    </Stack>
  );
}
