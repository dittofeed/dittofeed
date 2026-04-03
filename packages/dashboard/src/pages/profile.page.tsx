import { LoadingButton } from "@mui/lab";
import {
  Box,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import backendConfig from "backend-lib/src/config";
import { getMemberProfileWorkspaces } from "backend-lib/src/rbac";
import type { AuthMeProfileResponse, Role } from "isomorphic-lib/src/types";
import { WORKSPACE_ROLE_INFO } from "isomorphic-lib/src/workspaceRoles";
import {
  GetServerSideProps,
  InferGetServerSidePropsType,
  NextPage,
} from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import { enqueueSnackbar } from "notistack";
import { useCallback, useState } from "react";

import DashboardContent from "../components/dashboardContent";
import { addInitialStateToProps } from "../lib/addInitialStateToProps";
import { noticeAnchorOrigin } from "../lib/notices";
import { requestContext } from "../lib/requestContext";
import { PropsWithInitialState } from "../lib/types";

type ProfilePageProps = PropsWithInitialState<{ profile: AuthMeProfileResponse }>;

export const getServerSideProps: GetServerSideProps<ProfilePageProps> =
  requestContext(async (_ctx, dfContext) => {
    if (backendConfig().authMode !== "multi-tenant") {
      return {
        redirect: { destination: "/settings", permanent: false },
      };
    }
    const profile = await getMemberProfileWorkspaces(dfContext.member.id);
    return {
      props: addInitialStateToProps({
        dfContext,
        props: { profile },
      }),
    };
  });

const ProfilePage: NextPage<
  InferGetServerSidePropsType<typeof getServerSideProps>
> = function ProfilePage({ profile: initialProfile }) {
  const router = useRouter();
  const apiPassword = `${router.basePath}/api/auth/me/password`;

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const hasPassword = initialProfile.hasPassword;

  const onSavePassword = useCallback(async () => {
    if (newPassword !== newPasswordConfirm) {
      enqueueSnackbar("New passwords do not match.", {
        variant: "error",
        anchorOrigin: noticeAnchorOrigin,
      });
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, string> = {
        newPassword,
        newPasswordConfirm,
      };
      if (hasPassword) {
        body.currentPassword = currentPassword;
      }
      const res = await fetch(apiPassword, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 204) {
        enqueueSnackbar(
          hasPassword ? "Password updated." : "Password set.",
          { variant: "success", anchorOrigin: noticeAnchorOrigin },
        );
        setCurrentPassword("");
        setNewPassword("");
        setNewPasswordConfirm("");
        await router.replace(router.asPath);
        return;
      }
      if (res.status === 400) {
        let detail =
          "Check your current password and password requirements (min. 8 characters).";
        try {
          const data = (await res.json()) as { message?: string };
          if (typeof data.message === "string" && data.message.length > 0) {
            detail = data.message;
          }
        } catch {
          // ignore non-JSON body
        }
        enqueueSnackbar(`Could not update password. ${detail}`, {
          variant: "error",
          anchorOrigin: noticeAnchorOrigin,
        });
        return;
      }
      enqueueSnackbar("Could not update password.", {
        variant: "error",
        anchorOrigin: noticeAnchorOrigin,
      });
    } catch {
      enqueueSnackbar("Could not update password.", {
        variant: "error",
        anchorOrigin: noticeAnchorOrigin,
      });
    } finally {
      setSaving(false);
    }
  }, [
    apiPassword,
    currentPassword,
    hasPassword,
    newPassword,
    newPasswordConfirm,
    router,
  ]);

  return (
    <>
      <Head>
        <title>My Profile — Dittofeed</title>
      </Head>
      <DashboardContent>
        <Stack sx={{ width: "100%", height: "100%", p: 3 }} spacing={4}>
          <Typography variant="h4" component="h1">
            My Profile
          </Typography>

          <Paper variant="outlined" sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Email
            </Typography>
            <Typography variant="body1" sx={{ fontFamily: "monospace" }}>
              {initialProfile.email}
            </Typography>
          </Paper>

          <Paper variant="outlined" sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              {hasPassword ? "Change password" : "Set password"}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {hasPassword
                ? "Enter your current password and choose a new one."
                : "Add a password to sign in with email and password. SSO still works if configured."}
            </Typography>
            <Stack spacing={2} sx={{ maxWidth: 420 }}>
              {hasPassword ? (
                <TextField
                  label="Current password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  fullWidth
                  size="small"
                  autoComplete="current-password"
                />
              ) : null}
              <TextField
                label="New password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                fullWidth
                size="small"
                autoComplete="new-password"
              />
              <TextField
                label="Confirm new password"
                type="password"
                value={newPasswordConfirm}
                onChange={(e) => setNewPasswordConfirm(e.target.value)}
                fullWidth
                size="small"
                autoComplete="new-password"
              />
              <Box>
                <LoadingButton
                  variant="contained"
                  loading={saving}
                  onClick={() => void onSavePassword()}
                  disabled={
                    !newPassword ||
                    !newPasswordConfirm ||
                    (hasPassword && !currentPassword)
                  }
                >
                  {hasPassword ? "Update password" : "Set password"}
                </LoadingButton>
              </Box>
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Workspace access
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Workspace</TableCell>
                  <TableCell>Role</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {initialProfile.workspaces.map((w) => (
                  <TableRow key={w.workspaceId}>
                    <TableCell>{w.workspaceName}</TableCell>
                    <TableCell>
                      {
                        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                        WORKSPACE_ROLE_INFO[w.role as Role]?.label ?? w.role
                      }
                    </TableCell>
                  </TableRow>
                ))}
                {initialProfile.workspaces.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2}>
                      <Typography variant="body2" color="text.secondary">
                        No workspace roles yet.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </Paper>
        </Stack>
      </DashboardContent>
    </>
  );
};

export default ProfilePage;
