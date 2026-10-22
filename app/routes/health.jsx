import supabase from "../lib/supabase.server";

// Railway sets this on every build. Reporting it answers "did the deploy
// actually happen?" with one request: on 21 Oct a merge to main sat unbuilt
// while Railway was down, and the only way to tell was probing an endpoint
// whose behaviour had changed in that release.
const COMMIT = (process.env.RAILWAY_GIT_COMMIT_SHA || "").slice(0, 7) || "unknown";

export const loader = async () => {
  try {
    // Perform a trivial Supabase query - select id with limit 0 (lightweight connection test)
    // This tests the connection without returning data
    const { error } = await supabase.from("shops").select("id").limit(0);

    if (error) {
      // If shops table doesn't exist, that's ok - just check if we can connect
      // Try accessing Supabase's connection by checking the error type
      if (error.code === "42P01" || error.message.includes("does not exist")) {
        // Table doesn't exist yet, but connection works
        return new Response(JSON.stringify({ status: "ok", commit: COMMIT, message: "Connected (table not initialized)" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      
      console.error("Health check Supabase error:", error);
      return new Response(
        JSON.stringify({ status: "error", message: error.message }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // mode makes production-mode verifiable from outside: NODE_ENV drives
    // React/React Router runtime optimizations (dev warnings, error detail).
    return new Response(
      JSON.stringify({ status: "ok", mode: process.env.NODE_ENV || "unknown", commit: COMMIT }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Health check error:", error);
    return new Response(
      JSON.stringify({ status: "error", message: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};

