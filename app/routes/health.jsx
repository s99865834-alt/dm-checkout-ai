import supabase from "../lib/supabase.server";

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
        return new Response(JSON.stringify({ status: "ok", message: "Connected (table not initialized)" }), {
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

    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
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

