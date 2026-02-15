import { Redirect } from "expo-router";

export default function PublicIndexRedirect() {
  return <Redirect href="/(public)/welcome" />;
}
