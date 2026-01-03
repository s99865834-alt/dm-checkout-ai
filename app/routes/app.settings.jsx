import { redirect } from "react-router";

// Redirect old settings route to home page where automation controls now live
export const loader = async () => {
  throw redirect("/app");
};

