import {
  Box,
  CircularProgress,
  Link as MuiLink,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { GetServerSideProps, NextPage } from "next";
import Link from "next/link";

import { SubtleHeader } from "../../../components/headers";
import { UserLayout } from "../../../components/userLayout";
import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import { requestContext } from "../../../lib/requestContext";
import { PropsWithInitialState } from "../../../lib/types";
import { useUserIdentityAliasesQuery } from "../../../lib/useUserIdentityAliasesQuery";

interface UserAliasesPageProps {
  userId: string;
}

export const getServerSideProps: GetServerSideProps<
  PropsWithInitialState<UserAliasesPageProps>
> = requestContext(async (ctx, dfContext) => {
  const userId = ctx.query.id;
  if (typeof userId !== "string") {
    return { notFound: true };
  }

  return {
    props: addInitialStateToProps({
      serverInitialState: {},
      dfContext,
      props: { userId },
    }),
  };
});

function UserAliasesContent({ userId }: { userId: string }) {
  const { data, isPending, isError, error } =
    useUserIdentityAliasesQuery(userId);

  if (isPending) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (isError) {
    return (
      <Typography color="error">
        Failed to load aliases: {error.message}
      </Typography>
    );
  }

  if (!data) {
    return null;
  }

  const hasAnonymousLinks = data.linkedAnonymousIds.length > 0;
  const hasCanonical = data.canonicalUserId != null;

  if (!hasAnonymousLinks && !hasCanonical) {
    return (
      <Typography color="text.secondary">
        No linked identities for this profile. Send an alias event or an
        identify with both userId and anonymousId to create a link.
      </Typography>
    );
  }

  return (
    <Stack spacing={2}>
      {hasCanonical ? (
        <Typography>
          This anonymous profile is linked to known user{" "}
          <MuiLink component={Link} href={`/users/${data.canonicalUserId}`}>
            {data.canonicalUserId}
          </MuiLink>
          .
        </Typography>
      ) : null}
      {hasAnonymousLinks ? (
        <>
          <SubtleHeader>Linked anonymous IDs</SubtleHeader>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Anonymous ID</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.linkedAnonymousIds.map((anonId) => (
                <TableRow key={anonId}>
                  <TableCell>
                    <Typography
                      variant="body2"
                      sx={{ fontFamily: "monospace", wordBreak: "break-all" }}
                    >
                      {anonId}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      ) : null}
    </Stack>
  );
}

const UserAliases: NextPage<UserAliasesPageProps> = function UserAliases({
  userId,
}) {
  return (
    <UserLayout userId={userId}>
      <SubtleHeader>Aliases</SubtleHeader>
      <UserAliasesContent userId={userId} />
    </UserLayout>
  );
};

export default UserAliases;
