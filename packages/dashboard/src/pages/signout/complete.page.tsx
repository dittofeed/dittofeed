import { GetServerSideProps, NextPage } from "next";

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: "/login", permanent: false },
});

const SignOutCompletePage: NextPage = function SignOutCompletePage() {
  return null;
};

export default SignOutCompletePage;
